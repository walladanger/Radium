import { describe, expect, it } from 'vitest'
import { restoreWorkspace, moveRect, zoomViewport, createPanelInstance } from '../workspaceDocument'

describe('workspace documents', () => {
  it('migrates the old board without losing its order or lock', () => {
    const board = restoreWorkspace({ open: ['panel:notes', 'builtin:models'], locked: true })
    expect(board.open).toEqual(['panel:notes', 'builtin:models'])
    expect(board.locked).toBe(true)
    expect(board.panels['panel:notes'].definitionId).toBe('panel:notes')
    expect(board.panels['panel:notes'].windows).toEqual({ x: 24, y: 24, width: 420, height: 320 })
    expect(board.mode).toBe('split')
  })
  it('keeps an intentionally empty board empty', () => {
    expect(restoreWorkspace({ open: [], locked: false }).open).toEqual([])
  })
  it('deduplicates legacy IDs and refuses invalid definitions', () => {
    expect(restoreWorkspace({ open: ['panel:notes', 'panel:notes', '../bad', 12] }).open)
      .toEqual(['panel:notes'])
  })
  it('restores separate geometry and clamps malformed numeric state', () => {
    const panel = createPanelInstance('panel:notes', 'instance-one', 0)
    panel.windows = { x: Infinity, y: -20, width: 1, height: NaN }
    panel.canvas = { x: -500, y: 250, width: 800, height: 400 }
    const restored = restoreWorkspace({
      schemaVersion: 1, open: ['instance-one'], panels: { 'instance-one': panel },
      mode: 'canvas', viewport: { x: Infinity, y: 5, zoom: 0 }, snap: true,
    })
    expect(restored.panels['instance-one'].windows).toEqual({ x: 24, y: 0, width: 240, height: 320 })
    expect(restored.panels['instance-one'].canvas).toEqual({ x: -500, y: 250, width: 800, height: 400 })
    expect(restored.viewport).toEqual({ x: 0, y: 5, zoom: 0.25 })
    expect(restored.mode).toBe('canvas')
  })
  it('rejects unknown future schemas instead of overwriting them', () => {
    expect(() => restoreWorkspace({ schemaVersion: 999 })).toThrow(/newer workspace/i)
  })
  it('separates instance identity and definition identity', () => {
    const one = createPanelInstance('panel:notes', 'one', 0)
    const two = createPanelInstance('panel:notes', 'two', 1)
    one.windows.x = 500
    expect(two.windows.x).toBe(64)
    expect(one.id).not.toBe(two.id)
    expect(two.definitionId).toBe('panel:notes')
  })
  it('snaps movement in world coordinates and keeps Windows titles reachable', () => {
    const rect = { x: 24, y: 24, width: 420, height: 320 }
    expect(moveRect(rect, -200, 17, 'windows', true)).toEqual({ ...rect, x: 0, y: 48 })
    expect(moveRect(rect, -200, 17, 'canvas', true)).toEqual({ ...rect, x: -176, y: 48 })
  })
  it('anchors zoom at the cursor and caps it', () => {
    expect(zoomViewport({ x: 0, y: 0, zoom: 1 }, 2, { x: 100, y: 50 }))
      .toEqual({ x: -100, y: -50, zoom: 2 })
    expect(zoomViewport({ x: 0, y: 0, zoom: 1 }, 100, { x: 0, y: 0 }).zoom).toBe(2)
  })
})
