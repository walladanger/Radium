URL=https://github.com/AtomicBot-ai/atomic-chat-conf/releases/download/b11463/llama-b11463-bin-win-cpu-x64.zip
curl -fSL --retry 5 --retry-delay 3 "$URL" -o /tmp/llamacpp-upstream-backend.zip
ACTUAL="$(sha256sum /tmp/llamacpp-upstream-backend.zip | cut -d' ' -f1)"
echo "Actual SHA256: $ACTUAL"
