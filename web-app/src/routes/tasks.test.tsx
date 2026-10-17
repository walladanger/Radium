import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import translations from '@/locales/en/atomic-tasks.json'
import { TasksPage } from './tasks'

const { command, connect, disconnect, state } = vi.hoisted(() => {
  const command = vi.fn().mockResolvedValue(undefined)
  const connect = vi.fn().mockResolvedValue(undefined)
  const disconnect = vi.fn()
  return { command, connect, disconnect, state: { connection: 'connected', busy: false, error: null, snapshot: { schema_version: 1, sequence: 5, plans: [{ id: 'p', project_id: 'repo', title: 'Settings', revision: 3, status: 'active', created_at: 1 }], tasks: [{ id: 't', plan_id: 'p', title: 'Implement backend', description: 'Test the endpoint', role: 'edit', dependencies: [], write_scopes: ['src/api'], revision: 2, status: 'failed', created_at: 1 }], attempts: [] as Array<{ id: string; task_id: string; worker_id: string; model: string; role: string; status: string; created_at: number }>, workers: [], approvals: [], artifacts: [], candidates: [] }, command, connect, disconnect } }
})
vi.mock('@/stores/atomic-tasks-store', () => ({ useAtomicTasks: Object.assign(() => state, { getState: () => state }) }))
vi.mock('@/containers/HeaderPage', () => ({ default: ({ children }: { children: React.ReactNode }) => <header>{children}</header> }))
vi.mock('@/i18n/react-i18next-compat', () => ({ useTranslation: () => ({ t: (key: string) => key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, translations) ?? key }) }))

describe('Tasks workspace', () => {
  it('stops offering retry after the bounded two-attempt budget', () => {
    state.snapshot.attempts = [1, 2].map(index => ({ id: `attempt-${index}`, task_id: 't', worker_id: 'worker', model: 'local', role: 'edit', status: 'failed', created_at: index }))
    render(<TasksPage />)
    fireEvent.click(screen.getByRole('button', { name: /Implement backend/ }))
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled()
  })
  it('does not offer retry for cancelled work that requires a new plan', () => {
    state.snapshot.tasks[0].status = 'cancelled'
    render(<TasksPage />)
    fireEvent.click(screen.getByRole('button', { name: /Implement backend/ }))
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled()
  })
  it('preserves the task draft when the controller rejects creation', async () => {
    command.mockResolvedValueOnce(false)
    render(<TasksPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }))
    fireEvent.change(screen.getByLabelText('Project identifier'), { target: { value: 'repo' } })
    fireEvent.change(screen.getByLabelText('Plan title'), { target: { value: 'Draft to preserve' } })
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Work' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }))
    expect(await screen.findByDisplayValue('Draft to preserve')).toBeInTheDocument()
  })
  it('disables mutations while recorded state is stale', () => {
    state.connection = 'reconnecting'
    render(<TasksPage />)
    expect(screen.getByText(/Reconnecting/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create plan' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Implement backend/ }))
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled()
  })

  beforeEach(() => { vi.clearAllMocks(); state.connection = 'connected'; state.snapshot.tasks[0].status = 'failed'; state.snapshot.attempts = [] })
  it('shows recorded progress and uses authoritative revisions for actions', () => {
    render(<TasksPage />)
    expect(screen.getByText('0 / 1 tasks validated · 0 running · 0 ready for workers')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(command).toHaveBeenCalledWith({ type: 'pause_plan', plan_id: 'p' }, 3)
    fireEvent.click(screen.getByRole('button', { name: /Implement backend/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(command).toHaveBeenCalledWith({ type: 'retry_task', task_id: 't' }, 2)
    expect(screen.getByText('Artifact validation records task evidence. Applying changes to your branch is a separate review step.')).toBeInTheDocument()
  })
  it('creates typed bounded tasks through a readable form', async () => {
    render(<TasksPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }))
    fireEvent.change(screen.getByLabelText('Project identifier'), { target: { value: 'repo' } })
    fireEvent.change(screen.getByLabelText('Plan title'), { target: { value: 'New feature' } })
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Implement feature' } })
    fireEvent.change(screen.getByLabelText('Instructions and acceptance criteria'), { target: { value: 'Existing tests pass' } })
    fireEvent.change(screen.getByLabelText('Writable scope'), { target: { value: 'src/feature\nsrc/tests' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }))
    expect(command).toHaveBeenCalledTimes(1)
    expect(command.mock.calls[0]![0]).toMatchObject({ type: 'create_plan', project_id: 'repo', title: 'New feature', tasks: [{ id: expect.any(String), title: 'Implement feature', description: 'Existing tests pass', role: 'edit', dependencies: [], write_scopes: ['src/feature', 'src/tests'] }] })
  })
})
