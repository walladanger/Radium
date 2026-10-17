# Tasks browser verification — 2026-10-03

Verified the real Radium browser UI at http://localhost:1420/tasks against the actual Rust controller in WSL2, using an isolated Linux SQLite database and a disposable fixture credential stored with mode 600. No production credentials, cloud requests, model inference, or fabricated workers were used.

Observed behavior:
- Authenticated connection reads the canonical snapshot and subscribes to resumable events.
- Creating a two-task dependency plan produces recorded sequence 1. Starting it produces sequence 2: its predecessor becomes ready and its dependent stays planned.
- Pausing produces sequence 3 with both tasks planned. Stopping the owned controller preserves that snapshot, displays the stale warning, and disables mutations.
- Restarting the same database reconnects automatically at sequence 3. An external authenticated command starts the plan and the browser updates to sequence 4 through the event stream.
- A second plan created after the form fix selects the new plan, closes the form, and resets its draft. Cancelling its selected task records sequence 6.
- Retry of a cancelled task is rejected by the controller without changing state. The UI now disables that action; two-attempt failures also disable retry.
- Pausing the first plan records sequence 7. Graph and selected-task details show prerequisite titles instead of UUIDs.
- At 390 × 844, document width is 390 pixels; the graph's wider 524-pixel content scrolls inside its panel. Viewport override was reset afterward.

Changes made following live findings:
- Browser fetch is invoked through its global receiver, fixing Illegal invocation in the real browser.
- Commands report confirmed success or failure to callers. Rejected revisions refresh canonical state while retaining the error.
- Failed creation preserves the draft; successful creation resets it and selects the actual new plan.
- Retry availability follows the controller's failed-only, two-attempt policy.

Verification: 19 focused tests passed; TypeScript project check passed; focused production ESLint passed with zero warnings; Vite production build passed; Git whitespace check passed. Two screenshots were displayed by the browser tool (desktop graph and narrow-screen task details). The browser screenshot API does not expose a saved artifact path in this environment.

Remaining interface gaps: artifact content/diff/test-result retrieval, candidate assembly and acceptance commands, observed worker stages, worker queue/resource panels, calendar/board/Sankey views, and authenticated phone pairing. Snapshot metadata alone cannot support claims that those workflows are complete. These need controller-backed contracts and subsequent implementation.

Fixture evidence is recorded in the workspace radium-ui-live-snapshot.json. The owned controller and Vite processes are stopped after this verification; the isolated Linux fixture database is retained for reproducibility.
