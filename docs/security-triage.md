# Local security triage

`scripts/security-triage.mjs` groups GitHub alerts and records local investigation
attempts without changing branches, committing code or changing GitHub alerts.
It requires Node 18+; online sync additionally requires an authenticated GitHub CLI
with permission to read the repository's alerts. There are no npm dependencies.

Every command requires `--dir` with an absolute directory **outside this source
checkout**. Only `radium-security-triage.json` is written there. Use a private
directory because alert locations and your notes can contain sensitive information.
Linked directories and linked state files are rejected. `status` never creates or
modifies files. Import, sync and attempt use an exclusive temporary lock and refuse
to overwrite state changed by another writer. Retry a conflicting operation. A
crashed process may leave a `.lock` file beside the state; verify no writer is
running before removing that lock yourself.

```powershell
$triageDir = Join-Path $env:LOCALAPPDATA 'Radium\security-triage'
node scripts/security-triage.mjs sync --dir $triageDir --repo walladanger/Radium
node scripts/security-triage.mjs status --dir $triageDir
node scripts/security-triage.mjs attempt --dir $triageDir --id GROUP_ID --status IN_PROGRESS --note "Reproduced with an offline fixture"
```

Choose `OPEN`, `IN_PROGRESS`, `VERIFIED_LOCAL` or `ESCALATED` for a local status.
`VERIFIED_LOCAL` records your assessment; it does not claim GitHub closed an alert.
Use the stable group ID printed by `status`. Attempts append a timestamp, status
and note to that group. Reimporting preserves those attempts. Groups and individual
alerts missing from a later snapshot remain with `present: false`; missing data
never implies a fix. A previously unseen alert or a fixed/dismissed alert reopening
resets the group's local status to `OPEN`, while retaining its investigation history.

For offline use, supply a JSON file with two arrays: `dependabot` and
`code_scanning`, plus `repo` (owner/repository) and `ref` (`refs/heads/main`, for
example). A state directory is bound to that repository/ref; changing either
requires another directory so identical alert numbers never mix repositories.
Entries use the corresponding GitHub alert shape: `number`,
`state`, `dependency.package.{name,ecosystem}` for dependency alerts, or `rule.id`
and `most_recent_instance.location.path` for code alerts. Severity is taken from
`security_advisory.severity` or `rule.security_severity_level`, respectively.
Dependency groups share package/ecosystem; code groups share rule/path.

```powershell
$snapshot = Join-Path $env:TEMP 'radium-alerts.json'
node scripts/security-triage.mjs import --dir $triageDir --file $snapshot
node --test scripts/security-triage.test.mjs
```

Online sync makes only paginated `GET` requests for open Dependabot alerts and code
scanning alerts scoped to `refs/heads/main`. Set `--ref refs/heads/BRANCH` to examine
another branch. Dependabot alerts are repository scoped; the saved state records
the repository and code-scanning ref. Fetch or validation failures preserve the existing local state.
The utility does not create dismissal commands, execute generated commands or run
Git. Fixes, commits and alert disposition remain separate reviewed actions.

Recovered selectively from branch commit `17b7bcc642e1c33c4f946ff482f7caf48e0e43a7`;
historical reports, dependency changes and automatic mutation behavior are omitted.
