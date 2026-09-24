#!/usr/bin/env node
// triage.mjs - deterministic state engine for the Radium security-triage loop.
// Node >= 18, zero npm dependencies. Needs git and the GitHub CLI (gh) on PATH.
// Lives at <repo-root>/.security-triage/triage.mjs
//
//   node .security-triage/triage.mjs sync          fetch open alerts (gh), rebuild groups + INDEX.md, detect merged/failed fixes
//   node .security-triage/triage.mjs build         same as sync but offline (uses last fetch)
//   node .security-triage/triage.mjs begin         claim the next group, write CURRENT.md, print the brief
//   node .security-triage/triage.mjs detail <key>  full GitHub detail for one alert (e.g. C671 or D25), incl. rule help
//   node .security-triage/triage.mjs end <RESULT> <STRATEGY> [--dismiss-reason <r>]
//                                                  validate CURRENT.md, append it to the group log + LOG.md, commit
//   node .security-triage/triage.mjs status        counts + next 10 in queue
//   node .security-triage/triage.mjs set <group> <STATUS>    human override
//   node .security-triage/triage.mjs dismissals    write DISMISSALS.md + apply-dismissals.ps1 for HUMAN review
//
// Env overrides: TRIAGE_REPO (walladanger/Radium), TRIAGE_MAIN (main), TRIAGE_REMOTE (origin),
//                TRIAGE_BRANCH (security-triage), TRIAGE_MAX_ATTEMPTS (4)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(DIR);
const RAW = path.join(DIR, 'raw');
const GDIR = path.join(DIR, 'groups');
const STATE = path.join(DIR, 'state.json');
const INDEX = path.join(DIR, 'INDEX.md');
const LOG = path.join(DIR, 'LOG.md');
const CURRENT = path.join(DIR, 'CURRENT.md');
const REPO = process.env.TRIAGE_REPO || 'walladanger/Radium';
const MAIN = process.env.TRIAGE_MAIN || 'main';
const REMOTE = process.env.TRIAGE_REMOTE || 'origin';
const BRANCH = process.env.TRIAGE_BRANCH || 'security-triage';
const MAX_ATTEMPTS = Number(process.env.TRIAGE_MAX_ATTEMPTS || 4);
const DEP_RESCAN_HOURS = 6;
const OFFLINE = process.env.TRIAGE_OFFLINE === '1';

const STRATEGIES = {
  dependency: ['DEP-UPSTREAM', 'DEP-LOCK-REFRESH', 'DEP-BUMP-DIRECT', 'DEP-BUMP-PARENT', 'DEP-OVERRIDE', 'DEP-REMOVE', 'DEP-REPLACE'],
  code: ['CODE-UPSTREAM', 'CODE-FIX-MINIMAL', 'CODE-FIX-SAFE-API', 'CODE-FIX-GUARD', 'CODE-FIX-REFACTOR', 'CODE-REMOVE'],
  any: ['PROPOSE-DISMISS', 'ESCALATE'],
};
const RESULTS = ['VERIFIED_LOCAL', 'FAILED', 'PROPOSED_DISMISSAL', 'ESCALATED'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'FAILED_RETRY', 'REMOTE_FAILED', 'VERIFIED_LOCAL', 'MERGED_PENDING',
  'PROPOSED_DISMISSAL', 'ESCALATED', 'CLOSED'];
const WORKABLE = ['IN_PROGRESS', 'REMOTE_FAILED', 'FAILED_RETRY', 'OPEN']; // pick order
const SEV_RANK = { critical: 0, high: 1, error: 2, medium: 2, moderate: 2, warning: 3, low: 3, note: 4, unknown: 4 };
const DISMISS = {
  dependabot: ['fix_started', 'inaccurate', 'no_bandwidth', 'not_used', 'tolerable_risk'],
  'code-scanning': { false_positive: 'false positive', wont_fix: "won't fix", used_in_tests: 'used in tests' },
};
const SECTIONS = ['1. LOOK', '2. ANALYZE', '3. FIX', '4. VERIFY', '5. NEXT TIME'];

// ---------- helpers ----------
const die = (msg, code = 1) => { console.error(`ERROR: ${msg}`); process.exit(code); };
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJSON = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 1));
const run = (bin, args) => execFileSync(bin, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryRun = (bin, args) => { try { return run(bin, args); } catch { return null; } };
const slug = (s, n = 48) => String(s || 'x').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n) || 'x';
const cell = (s, n = 110) => { s = String(s ?? '').replace(/\s+/g, ' ').replace(/\|/g, '/'); return s.length > n ? s.slice(0, n - 3) + '...' : s; };
const pad = (n) => String(n).padStart(4, '0');
const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const appendLog = (line) => fs.appendFileSync(LOG, line + '\n');

// ---------- git ----------
const curBranch = () => tryRun('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
// files changed outside .security-triage/ (tracked changes + untracked files)
function codeChanges() {
  // -z output is NOT trimmed: the leading status column (" M path") matters
  let out = '';
  try { out = execFileSync('git', ['status', '--porcelain', '-z', '--untracked-files=all'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch { return []; }
  const parts = out.split('\0'), files = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i]; if (e.length < 4) continue;
    files.push(e.slice(3));
    if (e[0] === 'R' || e[0] === 'C') i++; // rename/copy: next entry is the source path
  }
  return files.filter((p) => !p.startsWith('.security-triage/'));
}
function ensureBranch() {
  const b = curBranch();
  if (!b) die('not inside a git repository.');
  if (b !== MAIN && b !== 'master') return b;
  if (codeChanges().length) die(`you are on ${b} with uncommitted changes. Commit or stash them, then re-run.`);
  if (tryRun('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${BRANCH}`]) !== null) run('git', ['switch', BRANCH]);
  else run('git', ['switch', '-c', BRANCH]);
  console.log(`switched from ${b} to branch ${BRANCH} (fixes are never committed to ${b} directly).`);
  return BRANCH;
}
function mainCommitFor(id) {
  // ids only contain [a-z0-9-] so no regex escaping is needed; ^...$ stops dep-npm-vite matching dep-npm-vitest
  const out = tryRun('git', ['log', `${REMOTE}/${MAIN}`, '-E', `--grep=^Triage-Group: ${id}$`, '--format=%H %ct', '-1']);
  if (!out) return null;
  const [sha, ct] = out.split(' ');
  // when did it LAND on main? = commit time of the first first-parent commit (usually the merge) that contains it
  const landing = (tryRun('git', ['rev-list', '--first-parent', '--ancestry-path', `${sha}..${REMOTE}/${MAIN}`]) || '').split('\n').filter(Boolean).at(-1);
  const landedAt = landing ? +tryRun('git', ['log', '-1', '--format=%ct', landing]) : +ct;
  return { sha, ct: landedAt };
}
const isAncestor = (a, b) => { try { run('git', ['merge-base', '--is-ancestor', a, b]); return true; } catch { return false; } };

// ---------- GitHub fetch ----------
function ghList(endpoint, allow404 = false) {
  try {
    const pages = JSON.parse(run('gh', ['api', '--paginate', '--slurp', endpoint]));
    return pages.flat();
  } catch (e) {
    const err = String(e.stderr || e.message);
    if (allow404 && /404|no analysis found/i.test(err)) return [];
    die(`gh api failed for ${endpoint}\n${err}\nNeeds GitHub CLI >= 2.48, logged in with the security_events scope:\n  gh auth refresh -s security_events`);
  }
}
function fetchAlerts() {
  fs.mkdirSync(RAW, { recursive: true });
  console.log(`fetching open alerts for ${REPO} (branch ${MAIN})...`);
  const dep = ghList(`repos/${REPO}/dependabot/alerts?state=open&per_page=100`);
  const cs = ghList(`repos/${REPO}/code-scanning/alerts?state=open&ref=refs/heads/${MAIN}&per_page=100`, true);
  let an = [];
  try { an = JSON.parse(run('gh', ['api', `repos/${REPO}/code-scanning/analyses?ref=refs/heads/${MAIN}&per_page=100`])); } catch { /* none yet */ }
  writeJSON(path.join(RAW, 'dependabot.json'), dep);
  writeJSON(path.join(RAW, 'code-scanning.json'), cs);
  writeJSON(path.join(RAW, 'analyses.json'), an);
  writeJSON(path.join(RAW, 'meta.json'), { repo: REPO, branch: MAIN, fetched_at: now(), dependabot: dep.length, code_scanning: cs.length });
  console.log(`  dependabot: ${dep.length} open | code scanning: ${cs.length} open | analyses: ${an.length}`);
}

// ---------- normalisation + grouping ----------
function normDep(a) {
  const d = a.dependency || {}, p = d.package || {}, adv = a.security_advisory || {}, v = a.security_vulnerability || {};
  return {
    key: `D${a.number}`, source: 'dependabot', number: a.number,
    severity: String(v.severity || adv.severity || 'unknown').toLowerCase(),
    ecosystem: p.ecosystem, pkg: p.name, manifest: d.manifest_path, scope: d.scope, relationship: d.relationship,
    ghsa: adv.ghsa_id, summary: adv.summary, range: v.vulnerable_version_range,
    patched: v.first_patched_version?.identifier || null,
  };
}
function normCs(a) {
  const r = a.rule || {}, i = a.most_recent_instance || {}, loc = i.location || {};
  return {
    key: `C${a.number}`, source: 'code-scanning', number: a.number,
    severity: String(r.security_severity_level || r.severity || 'unknown').toLowerCase(),
    tool: a.tool?.name || 'unknown', rule: r.id, ruleName: r.name || r.description, desc: r.description,
    path: loc.path, line: loc.start_line, message: i.message?.text, classifications: i.classifications || [],
  };
}
function groupOf(a) {
  if (a.source === 'dependabot') return { id: `dep-${slug(a.ecosystem, 10)}-${slug(a.pkg)}`, kind: 'dependency', title: `${a.pkg} (${a.ecosystem})` };
  const h = crypto.createHash('sha1').update(`${a.tool}|${a.rule}|${a.path}`).digest('hex').slice(0, 6);
  return { id: `cs-${slug(a.tool, 10)}-${slug(a.rule, 40)}-${slug(path.basename(a.path || 'unknown'), 24)}-${h}`, kind: 'code', title: `${a.ruleName || a.rule} in ${a.path}` };
}
function alertScore(a) {
  let s = SEV_RANK[a.severity] ?? 4;
  if (a.source === 'dependabot' && a.scope === 'development') s += 0.5;
  if (a.source === 'code-scanning') {
    if ((a.classifications || []).some((c) => /test|library|generated/i.test(c))) s += 1;
    else if (/(^|\/)(tests?|__tests__|vendor|demo|examples?|fixtures?)\//i.test(a.path || '')) s += 0.5;
  }
  return s;
}

// ---------- group file I/O ----------
const gfile = (id) => path.join(GDIR, `${id}.md`);
const getField = (t, f) => (t.match(new RegExp(`^${f}: (.*)$`, 'm')) || [])[1]?.trim();
const setField = (t, f, v) => t.replace(new RegExp(`^${f}: .*$`, 'm'), () => `${f}: ${v}`);
const ATTEMPT_RE = /^### Attempt (\d+) \| (\S+) \| (\S+)/gm;
const attemptLines = (t) => [...t.matchAll(ATTEMPT_RE)].map((m) => ({ n: +m[1], strategy: m[2], result: m[3] }));

function alertsTable(g) {
  const rows = Object.values(g.alerts).sort((a, b) => (b.open - a.open) || alertScore(a) - alertScore(b));
  const out = ['| key | state | sev | location | summary | patched in |', '|---|---|---|---|---|---|'];
  for (const a of rows.slice(0, 25)) {
    const loc = a.source === 'dependabot'
      ? `${a.manifest} (${a.scope || '?'}${a.relationship ? ', ' + a.relationship : ''})`
      : `${a.path}:${a.line}`;
    const sum = a.source === 'dependabot' ? `${a.ghsa || ''} ${a.summary} [vulnerable ${a.range}]` : `${a.message}`;
    out.push(`| ${a.key} | ${a.open ? 'open' : 'closed'} | ${a.severity} | ${cell(loc, 90)} | ${cell(sum)} | ${a.patched || '-'} |`);
  }
  if (rows.length > 25) out.push(`\n(${rows.length - 25} more alerts not shown - same package/rule)`);
  return out.join('\n');
}
function groupFacts(g) {
  const open = Object.values(g.alerts).filter((a) => a.open);
  const any = open[0] || Object.values(g.alerts)[0];
  const uniq = (xs) => [...new Set(xs.filter((x) => x !== undefined && x !== null && x !== ''))];
  if (g.kind === 'dependency') return [
    `title: ${g.title}`, `package: ${any.pkg}`, `ecosystem: ${any.ecosystem}`,
    `manifests: ${uniq(open.map((a) => a.manifest)).join(', ') || '-'}`,
    `scopes: ${uniq(open.map((a) => `${a.scope}/${a.relationship || 'unknown'}`)).join(', ') || '-'}`,
    `vulnerable_ranges: ${uniq(open.map((a) => a.range)).join(' ; ') || '-'}`,
    `patched_versions: ${uniq(open.map((a) => a.patched)).join(', ') || 'NONE PUBLISHED'}`,
  ].join('\n');
  return [
    `title: ${g.title}`, `tool: ${any.tool}`, `rule: ${any.rule}`, `rule_name: ${cell(any.ruleName, 160)}`,
    `file: ${any.path}`, `lines: ${uniq(open.map((a) => a.line)).sort((x, y) => x - y).join(', ') || '-'}`,
    `github_classification: ${uniq(open.flatMap((a) => a.classifications)).join(', ') || 'none'}`,
  ].join('\n');
}
function ensureGroupFile(g) {
  const f = gfile(g.id);
  let t = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : [
    `# ${g.id}`, 'status: OPEN', `kind: ${g.kind}`, `source: ${g.source}`, 'severity: -', 'open_alerts: -', '',
    '## Facts (generated)', '', '## Alerts (generated - do not edit)', '',
    '## Attempts', '<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->', '', '## Refresh log', '',
  ].join('\n');
  t = setField(t, 'severity', g.severity);
  t = setField(t, 'open_alerts', `${g.open} of ${Object.keys(g.alerts).length}`);
  t = t.replace(/## Facts \(generated\)[\s\S]*?(?=## Alerts)/, () => `## Facts (generated)\n${groupFacts(g)}\n\n`);
  t = t.replace(/## Alerts \(generated - do not edit\)[\s\S]*?(?=## Attempts)/, () => `## Alerts (generated - do not edit)\n${alertsTable(g)}\n\n`);
  fs.writeFileSync(f, t);
  return t;
}
const refreshLog = (t, msg) => t.trimEnd() + `\n- ${now()} ${msg}\n`;

// ---------- build ----------
function build() {
  fs.mkdirSync(GDIR, { recursive: true });
  const meta = readJSON(path.join(RAW, 'meta.json'), null);
  if (!meta) die('no fetched data yet. Run: node .security-triage/triage.mjs sync');
  const alerts = [
    ...readJSON(path.join(RAW, 'dependabot.json'), []).map(normDep),
    ...readJSON(path.join(RAW, 'code-scanning.json'), []).map(normCs),
  ];
  const state = readJSON(STATE, { iter: 0, current: null, groups: {} });
  for (const g of Object.values(state.groups)) for (const a of Object.values(g.alerts)) a.open = false;
  for (const a of alerts) {
    const { id, kind, title } = groupOf(a);
    const g = (state.groups[id] ||= { id, kind, source: a.source, title, alerts: {} });
    g.title = title;
    g.alerts[a.key] = { ...a, open: true };
  }
  const latest = {};
  for (const x of readJSON(path.join(RAW, 'analyses.json'), [])) {
    const tool = x.tool?.name; if (!tool) continue;
    if (!latest[tool] || x.created_at > latest[tool].created_at) latest[tool] = { sha: x.commit_sha, created_at: x.created_at };
  }
  if (!OFFLINE) tryRun('git', ['fetch', '--quiet', REMOTE, MAIN]);

  const changes = [];
  for (const g of Object.values(state.groups)) {
    const all = Object.values(g.alerts), open = all.filter((a) => a.open);
    const pool = open.length ? open : all;
    g.score = Math.min(...pool.map(alertScore));
    g.severity = pool.map((a) => a.severity).sort((x, y) => (SEV_RANK[x] ?? 4) - (SEV_RANK[y] ?? 4))[0];
    g.open = open.length;
    let t = ensureGroupFile(g);
    const st = getField(t, 'status');
    const attempts = attemptLines(t);
    let ns = st;
    if (open.length === 0 && st !== 'CLOSED') {
      ns = 'CLOSED'; t = refreshLog(t, `all alerts closed on GitHub (was ${st}) -> CLOSED`);
    } else if (open.length > 0 && st === 'CLOSED') {
      ns = 'OPEN'; t = refreshLog(t, `${open.length} alert(s) open again on GitHub -> OPEN`);
    } else if (open.length > 0 && ['VERIFIED_LOCAL', 'MERGED_PENDING'].includes(st)) {
      const m = mainCommitFor(g.id);
      if (m) {
        let rescanned;
        if (g.source === 'code-scanning') {
          const tools = [...new Set(open.map((a) => a.tool))];
          rescanned = tools.some((tool) => latest[tool] && isAncestor(m.sha, latest[tool].sha));
        } else {
          rescanned = (Date.now() / 1000 - m.ct) / 3600 >= DEP_RESCAN_HOURS;
        }
        if (rescanned) {
          ns = 'REMOTE_FAILED';
          // mark the newest VERIFIED_LOCAL attempt so the agent sees it did not hold up on GitHub
          const at = [...t.matchAll(/^### Attempt \d+ \| \S+ \| VERIFIED_LOCAL\b/gm)].at(-1);
          if (at) t = t.slice(0, at.index) + at[0].replace('VERIFIED_LOCAL', 'VERIFIED_LOCAL>REMOTE_FAILED') + t.slice(at.index + at[0].length);
          t = refreshLog(t, `fix ${m.sha.slice(0, 8)} is on ${MAIN} and was re-scanned, but ${open.length} alert(s) still open -> REMOTE_FAILED`);
        } else if (st !== 'MERGED_PENDING') {
          ns = 'MERGED_PENDING'; t = refreshLog(t, `fix ${m.sha.slice(0, 8)} merged to ${MAIN}; waiting for GitHub rescan -> MERGED_PENDING`);
        }
      }
    }
    if (['FAILED_RETRY', 'REMOTE_FAILED'].includes(ns) && attempts.length >= MAX_ATTEMPTS) {
      ns = 'ESCALATED'; t = refreshLog(t, `attempt budget (${MAX_ATTEMPTS}) used up -> ESCALATED`);
    }
    if (ns !== st) { t = setField(t, 'status', ns); changes.push(`${g.id}: ${st} -> ${ns}`); }
    fs.writeFileSync(gfile(g.id), t);
  }
  state.meta = meta;
  writeJSON(STATE, state);
  writeIndex(state);
  appendLog(`\n## SYNC ${now()} | ${meta.dependabot} dependabot + ${meta.code_scanning} code-scanning open alerts${changes.length ? '\n' + changes.map((c) => `- ${c}`).join('\n') : ''}`);
  if (changes.length) { console.log('status changes:'); changes.forEach((c) => console.log('  ' + c)); }
  printStatus(state);
}

// ---------- queue ----------
function snapshot(state) {
  return Object.values(state.groups).map((g) => {
    const t = fs.existsSync(gfile(g.id)) ? fs.readFileSync(gfile(g.id), 'utf8') : '';
    return { ...g, status: getField(t, 'status') || 'OPEN', attempts: attemptLines(t), text: t };
  });
}
function queue(state) {
  return snapshot(state)
    .filter((g) => WORKABLE.includes(g.status) && (g.status === 'IN_PROGRESS' || g.attempts.length < MAX_ATTEMPTS))
    .sort((a, b) => WORKABLE.indexOf(a.status) - WORKABLE.indexOf(b.status) || a.score - b.score || b.open - a.open || a.id.localeCompare(b.id));
}
function writeIndex(state) {
  const snap = snapshot(state);
  const counts = {}; for (const g of snap) counts[g.status] = (counts[g.status] || 0) + 1;
  const order = [...WORKABLE, 'VERIFIED_LOCAL', 'MERGED_PENDING', 'PROPOSED_DISMISSAL', 'ESCALATED', 'CLOSED'];
  snap.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.score - b.score || b.open - a.open);
  const m = state.meta || {};
  const lines = [
    '# Security triage index (generated - do not edit)', '',
    `repo: ${m.repo} | branch: ${m.branch} | alerts fetched: ${m.fetched_at} | iterations run: ${state.iter}`,
    `open alerts: ${snap.reduce((n, g) => n + g.open, 0)} (dependabot ${m.dependabot}, code scanning ${m.code_scanning}) in ${snap.filter((g) => g.open).length} groups`, '',
    '| status | groups |', '|---|---|', ...order.filter((s) => counts[s]).map((s) => `| ${s} | ${counts[s]} |`), '',
    '| # | group | status | sev | open/total | attempts | last attempt |', '|---|---|---|---|---|---|---|',
    ...snap.map((g, i) => {
      const la = g.attempts.at(-1);
      return `| ${i + 1} | [${g.id}](groups/${g.id}.md) | ${g.status} | ${g.severity} | ${g.open}/${Object.keys(g.alerts).length} | ${g.attempts.length} | ${la ? la.strategy + ' -> ' + la.result : '-'} |`;
    }),
  ];
  fs.writeFileSync(INDEX, lines.join('\n') + '\n');
}
function printStatus(state) {
  const snap = snapshot(state);
  const counts = {}; for (const g of snap) counts[g.status] = (counts[g.status] || 0) + 1;
  console.log(`groups: ${snap.length} | open alerts: ${snap.reduce((n, g) => n + g.open, 0)} | iterations run: ${state.iter}`);
  console.log('  ' + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  '));
  const q = queue(state).slice(0, 10);
  console.log(q.length ? 'next up:' : 'QUEUE_EMPTY - nothing workable left.');
  q.forEach((g, i) => console.log(`  ${i + 1}. ${g.id} [${g.status}, ${g.severity}, ${g.open} open, ${g.attempts.length} attempts]`));
}

// ---------- begin ----------
function currentTemplate(iter, g, n, used, allowed) {
  return [
    `# CURRENT ITERATION - fill in every section, then run \`end\``,
    `iter: ${pad(iter)}`, `group: ${g.id}`, `attempt: ${n} of ${MAX_ATTEMPTS}`,
    `forbidden_strategies: ${used.join(', ') || 'none'}`, `allowed_strategies: ${allowed.join(', ')}`, '',
    '## 1. LOOK',
    '> What the alert(s) say, which files/lines/manifests you opened, what versions are actually resolved in the lockfile.',
    '', '## 2. ANALYZE',
    '> Root cause. Is it real and reachable (runtime vs dev/test/demo/vendored)? If this is a retry: why did each previous attempt fail? Which strategy you chose and why it is DIFFERENT.',
    '', '## 3. FIX',
    '> Strategy name, exact commands run, files changed (or "none" for PROPOSE-DISMISS / ESCALATE).',
    '', '## 4. VERIFY',
    '> Commands run to prove the fix and the key lines of their output. For dependencies: the resolved version after the fix. For code: the flagged line after the fix + build/lint/test result.',
    '', '## 5. NEXT TIME',
    '> If FAILED: the most likely reason and the concrete strategy the next attempt should try. If VERIFIED_LOCAL: anything that could still make GitHub keep the alert open.',
    '',
  ].join('\n');
}
function begin() {
  ensureBranch();
  const state = readJSON(STATE, null) || die('no state. Run sync first.');
  const q = queue(state);
  if (!q.length) { console.log('QUEUE_EMPTY - no workable groups. Stop the loop and report.'); return; }
  const g = q[0];
  const resuming = g.status === 'IN_PROGRESS';
  if (!resuming) {
    const dirty = codeChanges();
    if (dirty.length) die(`uncommitted changes outside .security-triage/ from an unfinished iteration:\n  ${dirty.slice(0, 15).join('\n  ')}\nEither finish it with \`end\`, or discard with: git restore --staged --worktree . && git clean -fd -e .security-triage`);
  }
  const n = g.attempts.length + 1;
  const used = g.attempts.map((a) => a.strategy);
  const allowed = [...STRATEGIES[g.kind], ...STRATEGIES.any].filter((s) => !used.includes(s) || s === 'ESCALATE');
  let iter;
  if (resuming && state.current?.group === g.id) {
    iter = state.current.iter;
  } else {
    state.iter += 1; iter = state.iter;
    state.current = { iter, group: g.id, started: now() };
    fs.writeFileSync(gfile(g.id), setField(g.text, 'status', 'IN_PROGRESS'));
    writeJSON(STATE, state);
  }
  const cur = fs.existsSync(CURRENT) ? fs.readFileSync(CURRENT, 'utf8') : '';
  if (!(resuming && getField(cur, 'group') === g.id)) fs.writeFileSync(CURRENT, currentTemplate(iter, g, n, used, allowed));
  writeIndex(state);
  console.log(`=== ITER ${pad(iter)} | ${g.id} | ${resuming ? 'RESUMING an interrupted iteration (CURRENT.md kept)' : 'was ' + g.status} | attempt ${n} of ${MAX_ATTEMPTS} ===`);
  console.log(`kind: ${g.kind} | severity: ${g.severity} | open alerts: ${g.open}`);
  console.log(`FORBIDDEN (already tried, end will reject them): ${used.length ? used.join(', ') : 'none'}`);
  console.log(`ALLOWED this iteration: ${allowed.join(', ')}`);
  if (g.status === 'REMOTE_FAILED') console.log('NOTE: the last fix passed locally but GitHub still reports the alert after merge + rescan. Work out WHY before picking the next strategy.');
  if (n === MAX_ATTEMPTS) console.log('NOTE: this is the LAST attempt for this group. If you are not confident, use PROPOSE-DISMISS or ESCALATE.');
  console.log(`write your log in: .security-triage/CURRENT.md\n`);
  console.log(fs.readFileSync(gfile(g.id), 'utf8'));
}

// ---------- detail ----------
function detail([key]) {
  if (!/^[CD]\d+$/.test(key || '')) die('usage: detail <C123|D45>');
  const ep = key[0] === 'C' ? 'code-scanning' : 'dependabot';
  const a = JSON.parse(run('gh', ['api', `repos/${REPO}/${ep}/alerts/${key.slice(1)}`]));
  const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (/(^|_)url$|^avatar|^events_url|^node_id$/.test(k) ? undefined : v)));
  const help = a.rule?.help; if (a.rule) delete a.rule.help;
  console.log(JSON.stringify(strip(a), null, 1));
  if (help) console.log('\n--- RULE HELP ---\n' + help);
}

// ---------- end ----------
function parseCurrent(t) {
  const out = {};
  for (const s of SECTIONS) {
    const re = new RegExp(`^## ${s.replace('.', '\\.')}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm');
    const body = ((t.match(re) || [])[1] || '').split('\n').filter((l) => !l.trim().startsWith('>')).join('\n').trim();
    out[s] = body;
  }
  return out;
}
function end(args) {
  const [result, strategy, ...rest] = args;
  if (!result || !strategy) die('usage: end <RESULT> <STRATEGY> [--dismiss-reason <r>]');
  const opt = {}; for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = rest[i + 1];
  const state = readJSON(STATE, null) || die('no state. Run sync first.');
  if (!state.current) die('no iteration in progress. Run begin first.');
  const id = state.current.group, iter = state.current.iter;
  const g = state.groups[id];
  let t = fs.readFileSync(gfile(id), 'utf8');
  if (!RESULTS.includes(result)) die(`RESULT must be one of ${RESULTS.join(', ')}`);
  const allowed = [...STRATEGIES[g.kind], ...STRATEGIES.any];
  if (!allowed.includes(strategy)) die(`STRATEGY for a ${g.kind} group must be one of ${allowed.join(', ')}`);
  const used = attemptLines(t).map((a) => a.strategy);
  if (used.includes(strategy) && strategy !== 'ESCALATE') die(`${strategy} was ALREADY TRIED for ${id} and did not work. Pick a DIFFERENT strategy: ${allowed.filter((s) => !used.includes(s)).join(', ')}`, 2);
  if ((strategy === 'PROPOSE-DISMISS') !== (result === 'PROPOSED_DISMISSAL')) die('PROPOSE-DISMISS and PROPOSED_DISMISSAL must be used together.');
  if ((strategy === 'ESCALATE') !== (result === 'ESCALATED')) die('ESCALATE and ESCALATED must be used together.');
  if (result === 'PROPOSED_DISMISSAL') {
    const ok = g.source === 'dependabot' ? DISMISS.dependabot : Object.keys(DISMISS['code-scanning']);
    if (!ok.includes(opt['dismiss-reason'])) die(`--dismiss-reason must be one of: ${ok.join(', ')}`);
  }
  const cur = fs.existsSync(CURRENT) ? fs.readFileSync(CURRENT, 'utf8') : '';
  if (getField(cur, 'group') !== id) die(`CURRENT.md is not for ${id}. Run begin again.`);
  const sec = parseCurrent(cur);
  const empty = SECTIONS.filter((s) => sec[s].replace(/\s+/g, ' ').length < 15);
  if (empty.length) die(`CURRENT.md sections still empty or too short: ${empty.join(', ')}. Write them (below the > hint lines), then run end again.`);
  const changed = codeChanges();
  if (result === 'VERIFIED_LOCAL' && !changed.length) die('VERIFIED_LOCAL but no files changed outside .security-triage/. A verified fix must change something.');
  if (result !== 'VERIFIED_LOCAL' && changed.length) die(`result is ${result} but code changes are still present. Revert them first:\n  git restore --staged --worktree -- ${changed.slice(0, 8).join(' ')}\n  (and delete any new untracked files you created)\nThen run end again.`);

  const n = attemptLines(t).length + 1;
  let ns = { VERIFIED_LOCAL: 'VERIFIED_LOCAL', FAILED: 'FAILED_RETRY', PROPOSED_DISMISSAL: 'PROPOSED_DISMISSAL', ESCALATED: 'ESCALATED' }[result];
  if (ns === 'FAILED_RETRY' && n >= MAX_ATTEMPTS) ns = 'ESCALATED';
  const entry = [`### Attempt ${n} | ${strategy} | ${result} | ITER ${pad(iter)} | ${now()}`];
  for (const s of SECTIONS) entry.push(`#### ${s}`, sec[s], '');
  if (opt['dismiss-reason']) entry.push(`dismiss_reason: ${opt['dismiss-reason']}`, '');
  if (changed.length) entry.push(`files_changed: ${changed.join(', ')}`, '');
  t = t.replace(/\n## Refresh log/, () => `\n${entry.join('\n')}\n## Refresh log`);
  t = setField(t, 'status', ns);
  fs.writeFileSync(gfile(id), t);
  state.current = null;
  writeJSON(STATE, state);
  writeIndex(state);
  fs.writeFileSync(CURRENT, '# no iteration in progress - run `node .security-triage/triage.mjs begin`\n');
  const oneLine = (s) => cell(s, 160);
  appendLog(`- ITER ${pad(iter)} | ${now()} | ${id} | attempt ${n} | ${strategy} -> ${result} (status ${ns}) | ${oneLine(sec['2. ANALYZE'])}`);

  // commit: a verified fix carries the Triage-Group trailer (used later to detect the merge); anything else is log-only
  run('git', ['add', '-A']);
  const subject = result === 'VERIFIED_LOCAL' ? `security(${id}): ${strategy}` : `triage-log(${id}): ${strategy} -> ${result}`;
  const body = [oneLine(sec['3. FIX']), '', result === 'VERIFIED_LOCAL' ? `Triage-Group: ${id}` : `Triage-Log: ${id}`, `Triage-Iter: ${pad(iter)}`].join('\n');
  const c = tryRun('git', ['commit', '--no-verify', '-q', '-m', subject, '-m', body]);
  const sha = tryRun('git', ['rev-parse', '--short', 'HEAD']);
  console.log(`recorded attempt ${n} for ${id}: ${strategy} -> ${result} | status now ${ns} | ${c === null ? 'COMMIT FAILED - run git status' : 'committed ' + sha}`);
  printStatus(state);
}

// ---------- human tools ----------
function setStatus([id, st]) {
  const state = readJSON(STATE, null) || die('no state. Run sync first.');
  if (!state.groups[id]) die(`unknown group ${id}`);
  if (!STATUSES.includes(st)) die(`STATUS must be one of ${STATUSES.join(', ')}`);
  fs.writeFileSync(gfile(id), refreshLog(setField(fs.readFileSync(gfile(id), 'utf8'), 'status', st), `status manually set to ${st}`));
  if (state.current?.group === id) { state.current = null; writeJSON(STATE, state); }
  writeIndex(state);
  console.log(`${id} -> ${st}`);
}
function dismissals() {
  const state = readJSON(STATE, null) || die('no state. Run sync first.');
  const md = ['# Proposed dismissals - REVIEW BEFORE APPLYING', '',
    'The agent judged each group below not worth fixing. Read the reasoning, delete any line you disagree with',
    'from apply-dismissals.ps1, then run it yourself (works in PowerShell and bash). Nothing is sent to GitHub until you do.', ''];
  const ps = ['# Generated by triage.mjs dismissals - review every line first. Delete the lines you do not agree with.'];
  const clean = (s) => String(s).replace(/[^A-Za-z0-9 .,:;()/_+=-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 270);
  let count = 0;
  for (const g of snapshot(state).filter((x) => x.status === 'PROPOSED_DISMISSAL')) {
    const m = g.text.match(/### Attempt \d+ \| PROPOSE-DISMISS \| PROPOSED_DISMISSAL[^\n]*\n[\s\S]*?#### 2\. ANALYZE\n([\s\S]*?)\n#### [\s\S]*?dismiss_reason: (\S+)/);
    if (!m) continue;
    const why = clean(m[1]), r = m[2];
    const open = Object.values(g.alerts).filter((a) => a.open);
    md.push(`## ${g.id}  (${open.length} alerts, ${g.severity})`, `reason: **${r}** - ${why}`, `alerts: ${open.map((a) => a.key).join(', ')}`, '');
    ps.push('', `# ${g.id} - ${r}`);
    for (const a of open) {
      count++;
      if (a.source === 'dependabot') ps.push(`gh api -X PATCH repos/${REPO}/dependabot/alerts/${a.number} -f state=dismissed -f dismissed_reason=${r} -f "dismissed_comment=${why}"`);
      else ps.push(`gh api -X PATCH repos/${REPO}/code-scanning/alerts/${a.number} -f state=dismissed -f "dismissed_reason=${DISMISS['code-scanning'][r]}" -f "dismissed_comment=${why}"`);
    }
  }
  fs.writeFileSync(path.join(DIR, 'DISMISSALS.md'), md.join('\n') + '\n');
  fs.writeFileSync(path.join(DIR, 'apply-dismissals.ps1'), ps.join('\n') + '\n');
  console.log(`wrote DISMISSALS.md and apply-dismissals.ps1 (${count} alert dismissals). Nothing was sent to GitHub.`);
}

// ---------- main ----------
const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case 'sync': ensureBranch(); if (!OFFLINE) fetchAlerts(); build(); break;
  case 'build': build(); break;
  case 'begin': begin(); break;
  case 'detail': detail(args); break;
  case 'end': end(args); break;
  case 'status': printStatus(readJSON(STATE, null) || die('no state. Run sync first.')); break;
  case 'set': setStatus(args); break;
  case 'dismissals': dismissals(); break;
  default: console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 17).join('\n'));
}
