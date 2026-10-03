/**
 * The panel contract, frontend side.
 *
 * Two kinds of panel share one board. A *built-in* panel is trusted Radium
 * code rendering as a React component in-process. A *custom* panel is a
 * folder someone else wrote, rendered in a sandboxed iframe on the `panel://`
 * origin and reaching the host only through the authorising bridge. The board
 * only ever sees a descriptor, so it does not care which it is holding.
 *
 * See docs/decisions/2026-10-03-port-the-panel-mechanism-from-claudedesktopclient-not-its.md
 * and docs/superpowers/plans/2026-10-03-radium-panel-system-implementation.md.
 */

import type { ComponentType } from 'react'

export type PanelKind = 'builtin' | 'custom'

export type PanelDescriptor = {
  /** Stable id. Built-ins are `builtin:<name>`, custom panels `panel:<id>`. */
  id: string
  /** Shown in the tile header and the add-panel list. */
  name: string
  kind: PanelKind
  /** Rendered for `kind: 'builtin'` — trusted code, in-process. */
  component?: ComponentType
  /**
   * Present for `kind: 'custom'`. The iframe host takes this instead of a
   * component: a custom panel is someone else's code and never runs here.
   */
  manifest?: import('./registry').PanelManifest
}
