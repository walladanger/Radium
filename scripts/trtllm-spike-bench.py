#!/usr/bin/env python3
"""Benchmark one OpenAI-compatible endpoint for the TensorRT-LLM spike (Task 0).

Standard library only. Run it from the SAME client (Windows PowerShell) against
every configuration so client overhead cancels out:

  A  llama.cpp upstream, native Windows       (the baseline Radium ships)
  B  TensorRT-LLM in the private WSL2 distro
  C  llama.cpp upstream inside that distro
  D  TensorRT-LLM via Docker Desktop           (optional)

Subcommands:
  ready    poll until the server answers; prints seconds elapsed (load time)
  run      measure decode, prompt processing, concurrency and VRAM
  compare  print results side by side and apply the go/no-go bar

See docs/superpowers/plans/2026-10-09-tensorrt-llm-spike-checklist.md.
"""

import argparse
import json
import os
import platform
import random
import statistics
import string
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

FILLER = (
    "The quick brown fox jumps over the lazy dog while the river carries "
    "small boats past quiet villages and old stone bridges. "
)


# --------------------------------------------------------------------- HTTP


def _nonce():
    # Unique prefix so prefix/KV-cache reuse cannot make repeat prompts free.
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=12))


def http_json(url, payload=None, timeout=30):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def stream_chat(base, model, prompt, max_tokens, timeout=900):
    """One streaming chat request. Returns a dict of timings and token counts."""
    body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": 0,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    req = urllib.request.Request(
        base + "/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
    )
    t_start = time.perf_counter()
    t_first = None
    chunks = 0
    usage = None
    finish = None
    text = ""
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        for raw in resp:
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload == "[DONE]":
                break
            try:
                obj = json.loads(payload)
            except json.JSONDecodeError:
                continue
            if obj.get("usage"):
                usage = obj["usage"]
            for choice in obj.get("choices") or []:
                delta = choice.get("delta") or {}
                piece = delta.get("content") or delta.get("reasoning_content") or ""
                if piece:
                    chunks += 1
                    text += piece
                    if t_first is None:
                        t_first = time.perf_counter()
                if choice.get("finish_reason"):
                    finish = choice["finish_reason"]
    t_end = time.perf_counter()
    approx = not (usage and usage.get("completion_tokens"))
    completion = chunks if approx else usage["completion_tokens"]
    prompt_tokens = (usage or {}).get("prompt_tokens")
    ttft = (t_first - t_start) if t_first else None
    decode_tps = None
    if t_first and completion > 1 and t_end > t_first:
        decode_tps = (completion - 1) / (t_end - t_first)
    return {
        "ttft_s": ttft,
        "decode_tps": decode_tps,
        "completion_tokens": completion,
        "prompt_tokens": prompt_tokens,
        "approx_tokens": approx,
        "finish_reason": finish,
        "t_start": t_start,
        "t_end": t_end,
        "sample": text[:80],
    }


# --------------------------------------------------------------------- VRAM


class VramSampler:
    """Polls nvidia-smi; reports per-GPU peak MiB. Disabled if nvidia-smi fails."""

    def __init__(self, nvidia_smi):
        self.cmd = [
            nvidia_smi,
            "--query-gpu=memory.used",
            "--format=csv,noheader,nounits",
        ]
        self.peak = []
        self._stop = threading.Event()
        self._thread = None

    def _read(self):
        try:
            out = subprocess.run(
                self.cmd, capture_output=True, text=True, timeout=10, check=True
            ).stdout
            return [int(x) for x in out.split()]
        except Exception:
            return None

    def snapshot(self):
        return self._read()

    def _loop(self):
        while not self._stop.is_set():
            cur = self._read()
            if cur:
                if len(self.peak) != len(cur):
                    self.peak = [0] * len(cur)
                self.peak = [max(a, b) for a, b in zip(self.peak, cur)]
            self._stop.wait(0.5)

    def __enter__(self):
        self.peak = []
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        self._thread.join()


# ------------------------------------------------------------------- phases


def med(values):
    values = [v for v in values if v is not None]
    return statistics.median(values) if values else None


def cv(values):
    values = [v for v in values if v is not None]
    if len(values) < 2 or statistics.mean(values) == 0:
        return None
    return statistics.stdev(values) / statistics.mean(values)


def decode_prompt():
    return (
        f"[{_nonce()}] Write a long, detailed story about a lighthouse keeper. "
        "Keep writing until you are stopped; do not conclude."
    )


def sized_prompt(target_tokens):
    # ~1.3 tokens per word is a rough guess; real counts come from usage.
    words = int(target_tokens / 1.3)
    body = (FILLER * (words // 20 + 1)).split()[:words]
    return f"[{_nonce()}] " + " ".join(body) + "\nSummarise the text above in one word."


def phase_decode(base, model, runs, max_tokens):
    rows = [stream_chat(base, model, decode_prompt(), max_tokens) for _ in range(runs)]
    return {
        "decode_tps_median": med([r["decode_tps"] for r in rows]),
        "decode_tps_cv": cv([r["decode_tps"] for r in rows]),
        "ttft_s_median": med([r["ttft_s"] for r in rows]),
        "runs": [
            {
                k: r[k]
                for k in (
                    "decode_tps",
                    "ttft_s",
                    "completion_tokens",
                    "finish_reason",
                    "approx_tokens",
                    "sample",
                )
            }
            for r in rows
        ],
    }


def phase_prompt(base, model, target_tokens, runs):
    rows = [
        stream_chat(base, model, sized_prompt(target_tokens), 1) for _ in range(runs)
    ]
    tps = [
        (
            (r["prompt_tokens"] / r["ttft_s"])
            if r["prompt_tokens"] and r["ttft_s"]
            else None
        )
        for r in rows
    ]
    return {
        "target_tokens": target_tokens,
        "prompt_tokens": med([r["prompt_tokens"] for r in rows]),
        "pp_tps_median": med(tps),
        "ttft_s_median": med([r["ttft_s"] for r in rows]),
    }


def phase_concurrency(base, model, n, runs, max_tokens):
    agg, per_req = [], []
    for _ in range(runs):
        results = [None] * n

        def worker(i):
            try:
                results[i] = stream_chat(base, model, decode_prompt(), max_tokens)
            except Exception as exc:  # recorded, not fatal
                results[i] = {"error": str(exc)}

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        ok = [r for r in results if r and "error" not in r]
        if ok:
            wall = max(r["t_end"] for r in ok) - min(r["t_start"] for r in ok)
            agg.append(sum(r["completion_tokens"] for r in ok) / wall)
            per_req.append(med([r["decode_tps"] for r in ok]))
        if len(ok) != n:
            print(
                f"  warning: {n - len(ok)}/{n} concurrent requests failed",
                file=sys.stderr,
            )
    return {
        "concurrency": n,
        "aggregate_tps_median": med(agg),
        "per_request_decode_tps_median": med(per_req),
    }


# ----------------------------------------------------------------- commands


def cmd_ready(args):
    start = time.perf_counter()
    while time.perf_counter() - start < args.timeout:
        for path in ("/health", "/v1/models"):
            try:
                with urllib.request.urlopen(args.url + path, timeout=3) as resp:
                    if resp.status == 200:
                        print(
                            f"ready after {time.perf_counter() - start:.1f}s ({path})"
                        )
                        return 0
            except (urllib.error.URLError, OSError):
                pass
        time.sleep(1)
    print(f"not ready after {args.timeout}s", file=sys.stderr)
    return 1


def cmd_run(args):
    base = args.url.rstrip("/")
    models = http_json(base + "/v1/models")
    model = args.model_id or models["data"][0]["id"]
    sampler = VramSampler(args.nvidia_smi)
    baseline = sampler.snapshot()
    print(f"[{args.label}] model={model} baseline VRAM MiB={baseline}")

    print("warmup...")
    stream_chat(base, model, decode_prompt(), 32)

    result = {
        "meta": {
            "label": args.label,
            "url": base,
            "model_id": model,
            "quant": args.quant,
            "engine": args.engine,
            "notes": args.notes,
            "max_tokens": args.max_tokens,
            "runs": args.runs,
            "client": f"{platform.system()} {platform.release()} py{platform.python_version()}",
            "started": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        },
        "vram_baseline_mib": baseline,
    }
    with sampler:
        if not args.only_concurrency:
            print("decode, 1 request...")
            result["decode_c1"] = phase_decode(base, model, args.runs, args.max_tokens)
            for target in (512, 8192):
                print(f"prompt processing, ~{target} tokens...")
                try:
                    result[f"prompt_{target}"] = phase_prompt(base, model, target, 3)
                except Exception as exc:
                    result[f"prompt_{target}"] = {"error": str(exc)}
                    print(f"  failed (context too small?): {exc}", file=sys.stderr)
        if not args.skip_concurrency:
            for n in (4, 8):
                print(f"decode, {n} concurrent requests...")
                result[f"concurrency_{n}"] = phase_concurrency(
                    base, model, n, 3, args.max_tokens
                )
    result["vram_peak_mib"] = sampler.peak or None

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w") as fh:
        json.dump(result, fh, indent=2)
    print(f"wrote {args.out}")
    print_summary([result])
    return 0


def fmt(v, digits=1):
    return "-" if v is None else f"{v:.{digits}f}"


def rows_for(result):
    d = result.get("decode_c1", {})
    peak = result.get("vram_peak_mib")
    base = result.get("vram_baseline_mib")
    used = None
    if peak and base and len(peak) == len(base):
        used = sum(p - b for p, b in zip(peak, base))
    return [
        ("decode tok/s, 1 request", d.get("decode_tps_median")),
        ("decode run-to-run CV", d.get("decode_tps_cv")),
        ("TTFT s (short prompt)", d.get("ttft_s_median")),
        ("prompt proc tok/s @512", result.get("prompt_512", {}).get("pp_tps_median")),
        ("prompt proc tok/s @8k", result.get("prompt_8192", {}).get("pp_tps_median")),
        (
            "aggregate tok/s, 4 req",
            result.get("concurrency_4", {}).get("aggregate_tps_median"),
        ),
        (
            "aggregate tok/s, 8 req",
            result.get("concurrency_8", {}).get("aggregate_tps_median"),
        ),
        ("VRAM added at peak, MiB (all GPUs)", used),
    ]


def print_summary(results):
    labels = [r["meta"]["label"] for r in results]
    width = 36
    print("\n" + "metric".ljust(width) + "".join(name.rjust(12) for name in labels))
    all_rows = [rows_for(r) for r in results]
    for i, (name, _) in enumerate(all_rows[0]):
        cells = []
        for rows in all_rows:
            v = rows[i][1]
            cells.append(fmt(v, 3 if "CV" in name else 1).rjust(12))
        print(name.ljust(width) + "".join(cells))


def cmd_compare(args):
    results = []
    for path in args.files:
        with open(path) as fh:
            results.append(json.load(fh))
    # Several files may share a label (e.g. llama.cpp relaunched with
    # --parallel 8 for the concurrency phase): merge, first file wins per key.
    merged = {}
    for r in results:
        cur = merged.setdefault(r["meta"]["label"], r)
        if cur is not r:
            for k, v in r.items():
                if k != "meta" and not cur.get(k):
                    cur[k] = v
    results = list(merged.values())
    by = merged
    print_summary(results)

    print("\nconfigurations (check these are a fair pair):")
    for r in results:
        m = r["meta"]
        print(
            f"  {m['label']}: engine={m['engine']!r} model={m['model_id']!r} "
            f"quant={m['quant']!r} notes={m['notes']!r}"
        )

    warnings = []
    for r in results:
        label = r["meta"]["label"]
        d = r.get("decode_c1", {})
        if (d.get("decode_tps_cv") or 0) > 0.05:
            warnings.append(
                f"{label}: decode run-to-run CV above 5%, rerun on a quiet machine"
            )
        runs = d.get("runs", [])
        short = [x for x in runs if x.get("finish_reason") != "length"]
        if runs and len(short) / len(runs) > 0.2:
            warnings.append(
                f"{label}: >20% of decode runs ended before max_tokens; rates are less reliable"
            )
        if any(x.get("approx_tokens") for x in runs):
            warnings.append(
                f"{label}: server sent no token usage; counts are streamed chunks (approximate)"
            )
    for w in warnings:
        print("WARNING:", w)

    def dec(label):
        return (by.get(label, {}).get("decode_c1") or {}).get("decode_tps_median")

    print()
    for num, den, what in (
        ("B", "A", "TensorRT-LLM in WSL2 vs llama.cpp native Windows (THE BAR)"),
        ("B", "C", "TensorRT-LLM vs llama.cpp, both in WSL2 (engine gain)"),
        ("C", "A", "llama.cpp in WSL2 vs native Windows (WSL2 cost)"),
        ("D", "B", "Docker vs private distro"),
    ):
        if dec(num) and dec(den):
            print(f"{num}/{den} decode ratio: {dec(num) / dec(den):.3f}  {what}")

    if dec("A") and dec("B"):
        gain = dec("B") / dec("A") - 1
        verdict = "GO" if gain >= args.bar else "NO-GO"
        print(
            f"\nB beats A by {gain * 100:.1f}% at 1 request; bar is {args.bar * 100:.0f}% -> {verdict}"
        )
        print(
            "(Verdict is only as fair as the A/B pair above. Aggregate, prompt-processing,"
            " load time and VRAM are reported but do not change it.)"
        )
    else:
        print("\nNeed results for labels A and B to apply the bar.")
    return 0


def main():
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("ready")
    r.add_argument("--url", required=True)
    r.add_argument("--timeout", type=int, default=900)
    r.set_defaults(fn=cmd_ready)

    b = sub.add_parser("run")
    b.add_argument(
        "--url", required=True, help="server root URL: scheme, host and port"
    )
    b.add_argument("--label", required=True, help="A, B, C or D")
    b.add_argument(
        "--engine", required=True, help="e.g. 'llama.cpp b6xyz CUDA' or 'trtllm 1.4.0'"
    )
    b.add_argument("--quant", required=True, help="e.g. 'Q4_K_M', 'AWQ-INT4', 'BF16'")
    b.add_argument("--model-id", help="override the id from /v1/models")
    b.add_argument(
        "--notes", default="", help="launch flags, tp_size, ctx, anything unusual"
    )
    b.add_argument("--runs", type=int, default=5)
    b.add_argument("--max-tokens", type=int, default=256)
    b.add_argument("--skip-concurrency", action="store_true")
    b.add_argument(
        "--only-concurrency",
        action="store_true",
        help="for llama.cpp relaunched with --parallel 8; merged by compare",
    )
    b.add_argument("--nvidia-smi", default="nvidia-smi")
    b.add_argument("--out", required=True)
    b.set_defaults(fn=cmd_run)

    c = sub.add_parser("compare")
    c.add_argument("files", nargs="+")
    c.add_argument(
        "--bar",
        type=float,
        default=0.30,
        help="required B-over-A decode gain (default 0.30)",
    )
    c.set_defaults(fn=cmd_compare)

    args = p.parse_args()
    sys.exit(args.fn(args))


if __name__ == "__main__":
    main()
