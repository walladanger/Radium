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

it('opens, switches and closes a full page without remounting its chat sibling', () => {
  render(<div><WorkspacePanel /><Chat /></div>)
  fireEvent.change(screen.getByLabelText('Chat draft'), { target: { value: 'Keep my conversation draft' } })
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
  act(() => useWorkspacePanel.getState().toggle('agents'))
  expect(screen.getByText('Agent view')).toBeInTheDocument()
  act(() => useWorkspacePanel.getState().toggle('production'))
  expect(screen.getByText('Production view')).toBeInTheDocument()
  expect(screen.getByText('Agent view')).not.toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: translations.close }))
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
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

it('scrolls its body and has no side-panel resizer', () => {
  render(<div><WorkspacePanel /></div>)
  act(() => useWorkspacePanel.getState().toggle('agents'))
  expect(screen.queryByRole('separator')).not.toBeInTheDocument()
  expect(screen.getByText('Agent view').closest('.overflow-y-auto')).not.toBeNull()
})
