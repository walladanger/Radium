import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { WorkspacePanel } from './WorkspacePanel'
import { useWorkspacePanel } from '@/hooks/useWorkspacePanel'
import translations from '@/locales/en/workspace-panel.json'

vi.mock('@/i18n/react-i18next-compat', () => ({ useTranslation: () => ({
  t: (key: string) => key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, translations) ?? key,
}) }))
vi.mock('./AgentsPanel', () => ({ AgentsPanel: () => <div>Agent view</div> }))
vi.mock('./ProductionPanel', () => ({ ProductionPanel: () => <div>Production view<input aria-label="Plan draft" defaultValue="" /></div> }))
const connect = vi.fn()
vi.mock('@/stores/atomic-tasks-store', () => ({ useAtomicTasks: () => ({ connection: 'disconnected', connect, disconnect: vi.fn(), error: null }) }))

function Chat() {
  const [draft, setDraft] = useState('')
  return <input aria-label="Chat draft" value={draft} onChange={event => setDraft(event.target.value)} />
}
let measure: () => void
let availableWidth = 1200
beforeEach(() => {
  localStorage.clear()
  availableWidth = 1200
  Object.defineProperty(window, 'innerWidth', { value: 1440, writable: true, configurable: true })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width: availableWidth }) as DOMRect)
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { measure = callback }
    observe() {}
    disconnect() {}
  })
})
afterEach(() => { cleanup(); useWorkspacePanel.getState().close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks() })

it('opens, switches and closes an adjacent panel without remounting its chat sibling', () => {
  render(<div><WorkspacePanel /><Chat /></div>)
  fireEvent.change(screen.getByLabelText('Chat draft'), { target: { value: 'Keep my conversation draft' } })
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  act(() => useWorkspacePanel.getState().toggle('agents'))
  expect(screen.getByText('Agent view')).toBeInTheDocument()
  act(() => useWorkspacePanel.getState().toggle('production'))
  expect(screen.getByText('Production view')).toBeInTheDocument()
  expect(screen.getByText('Agent view')).not.toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: translations.close }))
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Chat draft')).toHaveValue('Keep my conversation draft')
})

it('keeps an unsaved plan draft when switching and closing panels', () => {
  render(<div><WorkspacePanel /></div>)
  act(() => useWorkspacePanel.getState().toggle('production'))
  fireEvent.change(screen.getByLabelText('Plan draft'), { target: { value: 'Unsaved requirements' } })
  act(() => useWorkspacePanel.getState().toggle('agents'))
  act(() => useWorkspacePanel.getState().close())
  act(() => useWorkspacePanel.getState().toggle('production'))
  expect(screen.getByLabelText('Plan draft')).toHaveValue('Unsaved requirements')
})

it('resizes with keyboard limits, restores after expanding, and remembers width after reopening and remounting', () => {
  const mounted = render(<div><WorkspacePanel /><Chat /></div>)
  act(() => useWorkspacePanel.getState().toggle('agents'))
  const separator = screen.getByRole('separator')
  fireEvent.keyDown(separator, { key: 'Home' })
  expect(separator).toHaveAttribute('aria-valuenow', '320')
  fireEvent.keyDown(separator, { key: 'ArrowRight' })
  expect(separator).toHaveAttribute('aria-valuenow', '344')
  fireEvent.click(screen.getByRole('button', { name: translations.expand }))
  expect(separator).toHaveAttribute('aria-valuenow', '880')
  fireEvent.click(screen.getByRole('button', { name: translations.restore }))
  expect(separator).toHaveAttribute('aria-valuenow', '344')
  act(() => useWorkspacePanel.getState().toggle('production'))
  expect(separator).toHaveAttribute('aria-valuenow', '344')
  fireEvent.keyDown(separator, { key: 'End' })
  fireEvent.keyDown(separator, { key: 'ArrowRight' })
  expect(separator).toHaveAttribute('aria-valuenow', '880')
  act(() => { availableWidth = 800; measure() })
  expect(separator).toHaveAttribute('aria-valuenow', '480')
  // A temporary smaller window must not overwrite the preferred width.
  act(() => { availableWidth = 1200; measure() })
  expect(separator).toHaveAttribute('aria-valuenow', '880')
  act(() => useWorkspacePanel.getState().close())
  act(() => useWorkspacePanel.getState().toggle('agents'))
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '880')
  mounted.unmount()
  render(<div><WorkspacePanel /></div>)
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '880')
})

it('stacks at narrow viewport widths and keeps the chat draft through resizing and expansion', () => {
  render(<div><WorkspacePanel /><Chat /></div>)
  fireEvent.change(screen.getByLabelText('Chat draft'), { target: { value: 'Keep this draft' } })
  act(() => useWorkspacePanel.getState().toggle('agents'))
  fireEvent.keyDown(screen.getByRole('separator'), { key: 'End' })
  fireEvent.click(screen.getByRole('button', { name: translations.expand }))
  act(() => { window.innerWidth = 390; window.dispatchEvent(new Event('resize')) })
  expect(screen.queryByRole('separator')).not.toBeInTheDocument()
  expect(screen.getByRole('complementary').style.width).toBe('')
  fireEvent.click(screen.getByRole('button', { name: translations.restore }))
  expect(screen.getByLabelText('Chat draft')).toHaveValue('Keep this draft')
})

it('drags from the current panel edge and stops after pointer cancellation', () => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  render(<div><WorkspacePanel /></div>)
  act(() => useWorkspacePanel.getState().toggle('agents'))
  const separator = screen.getByRole('separator')
  separator.setPointerCapture = vi.fn()
  fireEvent.pointerDown(separator, { button: 0, clientX: 600 })
  fireEvent.pointerMove(separator, { clientX: 700 })
  expect(separator).toHaveAttribute('aria-valuenow', '644')
  fireEvent.pointerCancel(separator)
  fireEvent.pointerMove(separator, { clientX: 800 })
  expect(separator).toHaveAttribute('aria-valuenow', '644')
})

it('keeps resizing usable when browser storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage disabled') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage disabled') })
  render(<div><WorkspacePanel /></div>)
  act(() => useWorkspacePanel.getState().toggle('agents'))
  fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '568')
})
