/**
 * The panel registry — one source of truth for what can go on the board.
 *
 * Built-ins are *discovered*, not listed: every module under `builtin/` that
 * exports a `panel` descriptor is in, which is the whole point. Claude Desktop
 * Client kept two hand-synced registries, and its Performance panel shipped in
 * one and not the other, so it could not be docked for two releases. A
 * registry you cannot forget to update cannot have that bug.
 *
 * Custom panels come from the Rust side via `panels_list`. Both kinds end up
 * as the same descriptor, so the board never has to care which it is holding.
 */

import type { ComponentType } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { PanelDescriptor } from './types'

/** What a built-in panel module must export. */
export type BuiltinPanel = {
  id: string
  name: string
  component: ComponentType
  defaultSize?: { w: number; h: number }
}

/** A custom panel's manifest, as the Rust registry reports it. */
export type PanelManifest = {
  contract: number
  id: string
  name: string
  entry: string
  description: string
  version: string
  author: string
  permissions: string[]
  mcpServers: string[]
  defaultSize: { w: number; h: number }
  path: string
}

export type BrokenPanel = { id: string; errors: string[] }

export type PanelListing = { installed: PanelManifest[]; broken: BrokenPanel[] }

// Eager so the board can render a built-in on first paint without a loading
// state for code that is already in the bundle.
const builtinModules = import.meta.glob<{ panel?: BuiltinPanel }>('./builtin/*.tsx', {
  eager: true,
})

export function builtinPanels(): PanelDescriptor[] {
  return Object.entries(builtinModules)
    .map(([path, module]): PanelDescriptor | null => {
      if (!module.panel) {
        // A module under builtin/ that exports no descriptor is a mistake
        // worth saying out loud rather than silently dropping.
        console.warn(`[panels] ${path} exports no \`panel\` descriptor and was skipped`)
        return null
      }
      return {
        id: `builtin:${module.panel.id}`,
        name: module.panel.name,
        kind: 'builtin' as const,
        component: module.panel.component,
      }
    })
    .filter((entry): entry is PanelDescriptor => entry !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function listCustomPanels(): Promise<PanelListing> {
  return invoke<PanelListing>('panels_list')
}

/**
 * Every panel that can go on the board, built-ins and installed custom ones
 * together. Broken panels are returned separately: they belong in the manager,
 * where their errors can be read, not in the add-panel list.
 */
export function mergeRegistry(
  builtins: PanelDescriptor[],
  custom: PanelManifest[]
): PanelDescriptor[] {
  return [
    ...builtins,
    ...custom.map((manifest) => ({
      id: `panel:${manifest.id}`,
      name: manifest.name,
      kind: 'custom' as const,
      manifest,
    })),
  ]
}
