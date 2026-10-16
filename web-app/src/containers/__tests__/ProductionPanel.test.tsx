import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProductionPanel } from '../ProductionPanel'
import { useAtomicTasks } from '@/stores/atomic-tasks-store'
import type { ControlSnapshot } from '@/lib/atomic-control'

vi.mock('@/i18n/react-i18next-compat', () => ({ useTranslation: () => ({
  t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
}) }))
vi.mock('../RenderMarkdown', () => ({ RenderMarkdown: () => <div>Dependency diagram</div> }))

const initial = useAtomicTasks.getState()
const snapshot = (): ControlSnapshot => ({ schema_version: 1, sequence: 1,
  plans: [{ id: 'p', project_id: 'project', title: 'Build', revision: 1, status: 'paused', created_at: 0 }],
  tasks: [{ id: 't', plan_id: 'p', title: 'Edit settings', description: 'Bounded change',
    role: 'edit', revision: 7, status: 'ready', created_at: 0, dependencies: [], write_scopes: [],
    instructions: ['Read settings'], acceptance_criteria: ['Tests pass'] }],
  attempts: [], workers: [], approvals: [], artifacts: [], candidates: [],
})
afterEach(() => { cleanup(); useAtomicTasks.setState(initial, true) })

it('saves explicit instructions against the selected task revision', async () => {
  const command = vi.fn().mockResolvedValue(true)
  useAtomicTasks.setState({ snapshot: snapshot(), connection: 'connected', command })
  render(<ProductionPanel />)
  fireEvent.click(screen.getByRole('button', { name: /1\. Edit settings/ }))
  fireEvent.change(screen.getByLabelText(/Exact instructions/), { target: { value: 'Read file\nEdit scoped file' } })
  fireEvent.click(screen.getByRole('button', { name: 'save' }))
  await waitFor(() => expect(command).toHaveBeenCalledWith(expect.objectContaining({
    type: 'update_task', task_id: 't', instructions: ['Read file', 'Edit scoped file'],
    acceptance_criteria: ['Tests pass'],
  }), 7))
})

it('preserves drafts and disables saving when a newer revision arrives', () => {
  useAtomicTasks.setState({ snapshot: snapshot(), connection: 'connected' })
  render(<ProductionPanel />)
  fireEvent.click(screen.getByRole('button', { name: /1\. Edit settings/ }))
  fireEvent.change(screen.getByLabelText('taskTitle'), { target: { value: 'My unsaved draft' } })
  const newer = snapshot()
  newer.tasks[0].revision = 8
  newer.tasks[0].title = 'Other actor edit'
  act(() => useAtomicTasks.setState({ snapshot: newer }))
  expect(screen.getByLabelText('taskTitle')).toHaveValue('My unsaved draft')
  expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved step' }))
  expect(screen.getByLabelText('taskTitle')).toHaveValue('Other actor edit')
})

it('disables editing while disconnected', () => {
  useAtomicTasks.setState({ snapshot: snapshot(), connection: 'reconnecting' })
  render(<ProductionPanel />)
  fireEvent.click(screen.getByRole('button', { name: /1\. Edit settings/ }))
  expect(screen.getByLabelText('taskTitle')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()
})

it('links proposed branches to editable steps without representing completed tasks as merges', () => {
  const data = snapshot()
  data.tasks.push({ ...data.tasks[0], id: 'check', title: 'Check combined result', dependencies: ['t'], status: 'completed' })
  useAtomicTasks.setState({ snapshot: data, connection: 'connected' })
  render(<ProductionPanel />)
  fireEvent.click(screen.getByRole('button', { name: 'Branch plan' }))
  expect(screen.getByText(/These are planning suggestions/)).toBeInTheDocument()
  const branch = screen.getByRole('button', { name: 'Proposed branch: Edit settings' })
  fireEvent.keyDown(branch, { key: 'Enter' })
  expect(screen.getByLabelText('taskTitle')).toHaveValue('Edit settings')
  expect(branch).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Proposed branch: Check combined result' }))
  expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()
})

it('blocks editing when an uncertain attempt still holds task authority', () => {
  const data = snapshot()
  data.attempts.push({ id: 'a', task_id: 't', worker_id: 'w', model: 'local', role: 'edit', status: 'outcome_unknown', created_at: 0 })
  useAtomicTasks.setState({ snapshot: data, connection: 'connected' })
  render(<ProductionPanel />)
  fireEvent.click(screen.getByRole('button', { name: /1\. Edit settings/ }))
  expect(screen.getByLabelText('taskTitle')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()
})
