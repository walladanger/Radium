# .security-triage — Radium security triage loop

Files:
- `triage.mjs` — the state engine (Node 18+, no npm deps). The agent calls it; you can too.
- `../.github/prompts/security-triage.prompt.md` — the loop prompt. In Copilot Chat type `/security-triage iterations=5`.
- Generated as it runs: `INDEX.md` (dashboard), `LOG.md` (chronological action log), `groups/<id>.md` (one file per
  package / rule-in-file, with every attempt's LOOK / ANALYZE / FIX / VERIFY / NEXT TIME), `CURRENT.md` (the iteration in progress).
- Not committed: `raw/` (API dumps) and `state.json`.

## One-time setup
1. `gh auth login` then `gh auth refresh -s security_events` (the GitHub CLI must be able to read security alerts).
2. Copy `.security-triage/` and `.github/prompts/` into the repo root. Commit them on `main`.
3. `node .security-triage/triage.mjs sync` — creates the `security-triage` branch and the dashboard.
4. So the loop doesn't stop for a confirmation on every command, add this to `.vscode/settings.json`:

```json
{
  "chat.tools.terminal.autoApprove": {
    "/^node \\.security-triage[\\\\/]triage\\.mjs (sync|build|begin|end|status|detail)\\b/": true,
    "/^git (status|diff|log|show|restore|remote -v)\\b/": true,
    "/^(yarn|npm|pnpm) (why|ls|install|up|upgrade|update|build|test|lint|tsc)\\b/": true,
    "/^cargo (check|clippy|tree|update|test)\\b/": true,
    "git push": false,
    "/gh api .*-X (PATCH|POST|PUT|DELETE)/": false
  }
}
```

## Your cycle
1. `/security-triage iterations=5` (start a **new chat each session**; local models lose track in long contexts — all memory is on disk).
2. Look over the `security-triage` branch → open a PR → merge into `main`.
3. After GitHub rescans (CodeQL runs on push; Dependabot within minutes), the next `sync` marks groups `CLOSED`,
   or `REMOTE_FAILED` if the alert is still open. The agent then picks a different strategy for those.
4. Now and then: `node .security-triage/triage.mjs dismissals` → read `DISMISSALS.md` → prune → run `apply-dismissals.ps1`.
5. Override anything: `node .security-triage/triage.mjs set <group> OPEN|ESCALATED|CLOSED|...`

Statuses: OPEN → IN_PROGRESS → VERIFIED_LOCAL → (merged) MERGED_PENDING → CLOSED,
or FAILED_RETRY / REMOTE_FAILED → retried with a different strategy, up to 4 attempts → ESCALATED.
Env overrides: `TRIAGE_MAX_ATTEMPTS`, `TRIAGE_BRANCH`, `TRIAGE_MAIN`, `TRIAGE_REPO`.
