# Open Agent and Production panels beside chat

Date: 2026-10-04

Status: implementation in progress; requested by the user.

## Context

The human and coordinator plan in the main conversation. Replacing that conversation with a task route makes it harder to compare agreed instructions with execution. The requested sidebar actions open additional panels in the existing application layout.

## Decision

Agents and Production use matching sidebar action buttons and one adjacent panel shell. Opening or closing a panel preserves the routed conversation. Connection credentials stay in memory and the same controller-backed store supplies both panels and Tasks.

Production edits versioned task title, description, exact instructions and acceptance criteria through update_task. Editing requires a draft or paused plan, an inactive eligible task and its expected revision. An external change preserves the local draft and disables saving until the human explicitly reloads. The next worker attempt consumes saved instructions. An in-flight attempt is never silently rewritten.

Agents presents selectable horizontal or vertical lanes. The UI displays actual task assignments, observed stages and step numbers, artifact evidence and blocking state. Detailed activity requires an explicitly filtered projection; private control fields, credentials and internal reasoning are not exposed. Token counts and elapsed time do not imply completion percentages.

The planning topology accompanies production steps. Mermaid is already a frontend dependency and supplies portable prerequisite diagrams. A Git-style planning map must label proposed branches and integration joins separately from verified repository history. Mermaid gitgraph is suitable for verified commits and merges; task completion alone must not generate a fictitious commit. More advanced graph editing and licensed telemetry engines are separate integrations with explicit dependency and packaging review.

## Consequences and acceptance

The controller remains the sole task authority. The UI adds no independent execution checklist or agent permission surface. Existing chat and native Tasks remain usable. Verification covers sidebar layout without navigation, stale/offline state, revision conflicts, exact worker requirements and graph label injection. Live execution and integration-history verification are required before declaring the feature complete.
