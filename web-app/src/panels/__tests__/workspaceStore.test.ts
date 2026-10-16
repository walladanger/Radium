import { beforeEach, describe, expect, it } from 'vitest'
import { useBoard } from '../useBoard'

beforeEach(() => useBoard.getState().reset())
describe('workspace layout store', () => {
  it('keeps separate rectangles when switching between Windows and Canvas', () => {
    const board = useBoard.getState()
    board.setMode('windows')
    board.setRect('builtin:models', { x: 96, y: 48, width: 600, height: 400 })
    board.setMode('canvas')
    board.setRect('builtin:models', { x: -300, y: 64, width: 500, height: 300 })
    const panel = useBoard.getState().panels['builtin:models']
    expect(panel.windows).toEqual({ x: 96, y: 48, width: 600, height: 400 })
    expect(panel.canvas).toEqual({ x: -300, y: 64, width: 500, height: 300 })
  })
  it('locks geometry and minimize operations without disabling content', () => {
    const board = useBoard.getState()
    board.setMode('windows')
    const before = { ...useBoard.getState().panels['builtin:models'].windows }
    board.setLocked(true)
    board.setRect('builtin:models', { x: 900, y: 900, width: 800, height: 500 })
    board.toggleMinimized('builtin:models')
    expect(useBoard.getState().panels['builtin:models'].windows).toEqual(before)
    expect(useBoard.getState().panels['builtin:models'].minimized).toBe(false)
    board.closePanel('builtin:models')
    expect(useBoard.getState().open).not.toContain('builtin:models')
  })
  it('restores a maximized panel to its original geometry', () => {
    const board = useBoard.getState()
    board.setMode('windows')
    const before = { ...useBoard.getState().panels['builtin:models'].windows }
    board.toggleMaximized('builtin:models')
    expect(useBoard.getState().panels['builtin:models'].maximized).toBe(true)
    board.toggleMaximized('builtin:models')
    expect(useBoard.getState().panels['builtin:models'].windows).toEqual(before)
  })
  it('persists only serializable workspace fields', () => {
    useBoard.getState().setMode('canvas')
    // Find the configured key without coupling this assertion to its spelling.
    const serialized = useBoard.persist.getOptions().name
    const document = JSON.parse(localStorage.getItem(serialized)!)
    expect(document.state.mode).toBe('canvas')
    expect(document.state.panels['builtin:models'].definitionId).toBe('builtin:models')
    expect(document.state.setMode).toBeUndefined()
  })
})
