/** Persisted presentation data only. Plugin code, credentials and jobs never live here. */
export type BoardMode = 'split' | 'windows' | 'canvas'
export type Rect = { x: number; y: number; width: number; height: number }
export type Viewport = { x: number; y: number; zoom: number }
export type PanelInstance = {
  id: string
  definitionId: string
  windows: Rect
  canvas: Rect
  minimized: boolean
  maximized: boolean
}
export type WorkspaceDocument = {
  schemaVersion: 1
  open: string[]
  panels: Record<string, PanelInstance>
  mode: BoardMode
  locked: boolean
  snap: boolean
  viewport: Viewport
}
export const DEFAULT_OPEN = ['builtin:hardware', 'builtin:models', 'builtin:skills']
export const GRID_SIZE = 16
export const MIN_PANEL = { width: 240, height: 160 }

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
const finite = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value)) : fallback
const definition = (value: unknown): value is string =>
  typeof value === 'string' && /^(builtin|panel):[a-z0-9][a-z0-9-]{0,99}$/.test(value)

/** Create an instance with independent rectangles for both spatial layouts. */
export function createPanelInstance(definitionId: string, id: string, index: number): PanelInstance {
  const rect = { x: 24 + (index % 8) * 40, y: 24 + (index % 8) * 40, width: 420, height: 320 }
  return { id, definitionId, windows: { ...rect }, canvas: { ...rect }, minimized: false, maximized: false }
}

/** Normalize untrusted stored geometry so a malformed size cannot trap a title bar. */
export function normalizeRect(value: unknown, fallback: Rect, canvas = false): Rect {
  const r = record(value)
  return {
    x: finite(r.x, fallback.x, canvas ? -100000 : 0, 100000),
    y: finite(r.y, fallback.y, canvas ? -100000 : 0, 100000),
    width: finite(r.width, fallback.width, MIN_PANEL.width, 4000),
    height: finite(r.height, fallback.height, MIN_PANEL.height, 4000),
  }
}

/** Restore v1 or migrate the original open-ID board without erasing an intentionally empty board. */
export function restoreWorkspace(value: unknown): WorkspaceDocument {
  const saved = record(value)
  if (typeof saved.schemaVersion === 'number' && saved.schemaVersion > 1) {
    throw new Error('This is a newer workspace. Open it with a newer Radium version.')
  }
  const source = Array.isArray(saved.open) ? saved.open : DEFAULT_OPEN
  const storedPanels = record(saved.panels)
  const panels: Record<string, PanelInstance> = Object.create(null)
  const open: string[] = []
  for (const candidate of source.slice(0, 100)) {
    if (typeof candidate !== 'string' || candidate.length > 160 || open.includes(candidate)) continue
    const stored = record(Object.prototype.hasOwnProperty.call(storedPanels, candidate) ? storedPanels[candidate] : undefined)
    const definitionId = definition(stored.definitionId) ? stored.definitionId : candidate
    if (!definition(definitionId)) continue
    // Object.fromEntries below and the null-prototype map avoid special-key assignments.
    const panel = createPanelInstance(definitionId, candidate, open.length)
    panel.windows = normalizeRect(stored.windows, panel.windows)
    panel.canvas = normalizeRect(stored.canvas, panel.canvas, true)
    panel.minimized = stored.minimized === true
    panel.maximized = stored.maximized === true
    panels[candidate] = panel
    open.push(candidate)
  }
  const vp = record(saved.viewport)
  return {
    schemaVersion: 1, open, panels,
    mode: saved.mode === 'windows' || saved.mode === 'canvas' ? saved.mode : 'split',
    locked: saved.locked === true, snap: saved.snap === true,
    viewport: {
      x: finite(vp.x, 0, -100000, 100000), y: finite(vp.y, 0, -100000, 100000),
      zoom: finite(vp.zoom, 1, 0.25, 2),
    },
  }
}

/** Move using world-space deltas. Canvas allows negative coordinates; Windows keeps headers reachable. */
export function moveRect(rect: Rect, dx: number, dy: number, mode: BoardMode, snap: boolean): Rect {
  const quantize = (n: number) => snap ? Math.round(n / GRID_SIZE) * GRID_SIZE : n
  return normalizeRect({ ...rect, x: quantize(rect.x + dx), y: quantize(rect.y + dy) }, rect, mode === 'canvas')
}

/** Zoom around a screen-space point rather than making content jump toward the origin. */
export function zoomViewport(viewport: Viewport, zoom: number, anchor: { x: number; y: number }): Viewport {
  const next = finite(zoom, viewport.zoom, 0.25, 2)
  const ratio = next / viewport.zoom
  return {
    x: anchor.x - (anchor.x - viewport.x) * ratio,
    y: anchor.y - (anchor.y - viewport.y) * ratio,
    zoom: next,
  }
}
