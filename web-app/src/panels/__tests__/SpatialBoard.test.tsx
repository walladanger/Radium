import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SpatialBoard } from '../SpatialBoard'
import { useBoard } from '../useBoard'

beforeEach(() => {
  useBoard.getState().reset()
  useBoard.getState().setMode('windows')
  Object.defineProperty(window, 'PointerEvent', { configurable: true, value: MouseEvent })
})
const renderBoard = () => render(<SpatialBoard renderPanel={(id) => (
  <input aria-label={'Input ' + id} defaultValue="kept" />
)} titleFor={(id) => id} />)
describe('spatial panel workspace', () => {
  it('maximizes inside the visible scrolled Windows viewport', () => {
    renderBoard()
    const host = document.querySelector('[data-workspace-surface]')!
    Object.defineProperty(host, 'scrollLeft', { configurable: true, value: 900 })
    Object.defineProperty(host, 'scrollTop', { configurable: true, value: 500 })
    fireEvent.scroll(host)
    fireEvent.click(screen.getByRole('button', { name: 'Maximize builtin:models' }))
    expect(document.querySelector('[data-panel-instance="builtin:models"]')).toHaveStyle({ left: '900px', top: '500px' })
  })
  it('moves by the title bar, and persists its final geometry', () => {
    renderBoard()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move builtin:models' }), { clientX: 100, clientY: 100, button: 0 })
    fireEvent.pointerMove(window, { clientX: 200, clientY: 160 })
    fireEvent.pointerUp(window, { clientX: 200, clientY: 160 })
    expect(useBoard.getState().panels['builtin:models'].windows).toEqual({ x: 164, y: 124, width: 420, height: 320 })
  })
  it('resizes without remounting panel content', () => {
    renderBoard()
    const input = screen.getByRole('textbox', { name: 'Input builtin:models' })
    fireEvent.change(input, { target: { value: 'unsaved' } })
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Resize builtin:models' }), { clientX: 0, clientY: 0, button: 0 })
    fireEvent.pointerMove(window, { clientX: 100, clientY: 80 })
    fireEvent.pointerUp(window, { clientX: 100, clientY: 80 })
    expect(useBoard.getState().panels['builtin:models'].windows.width).toBe(520)
    expect(screen.getByRole('textbox', { name: 'Input builtin:models' })).toBe(input)
    expect(input).toHaveValue('unsaved')
  })
  it('keeps content mounted across focus, minimize and layout mode changes', () => {
    renderBoard()
    const input = screen.getByRole('textbox', { name: 'Input builtin:models' })
    fireEvent.click(screen.getByRole('button', { name: 'Minimize builtin:models' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore builtin:models' }))
    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }))
    expect(screen.getByRole('textbox', { name: 'Input builtin:models' })).toBe(input)
  })
  it('prevents layout gestures while locked', () => {
    useBoard.getState().setLocked(true)
    renderBoard()
    expect(screen.getByRole('button', { name: 'Move builtin:models' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Resize builtin:models' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Input builtin:models' })).toBeEnabled()
  })
  it('moves with the keyboard and snaps to the grid', () => {
    useBoard.getState().setSnap(true)
    renderBoard()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Move builtin:models' }), { key: 'ArrowRight' })
    expect(useBoard.getState().panels['builtin:models'].windows.x).toBe(80)
  })
  it('keeps disconnected panels available on the canvas', () => {
    useBoard.getState().setMode('canvas')
    renderBoard()
    expect(screen.getByRole('textbox', { name: 'Input builtin:models' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByLabelText('Canvas zoom')).toHaveTextContent('125%')
  })
})
