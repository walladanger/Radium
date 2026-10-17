import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import translations from '@/locales/en/workspace-panel.json'
import { AgentsPanel } from './AgentsPanel'
const { state } = vi.hoisted(() => ({ state: { connection: 'connected', snapshot: { schema_version: 1, sequence: 1, plans: [], workers: [{ id: 'worker-1', host_id: 'wsl', capabilities: ['edit'], model: 'local-coder', status: 'busy' }], tasks: [{ id: 'task-1', title: 'Add bounded feature', role: 'edit', description: 'Edit only assigned files', instructions: ['Run focused checks'], acceptance_criteria: ['Checks pass'], status: 'running' }], attempts: [{ id: 'attempt-1', task_id: 'task-1', worker_id: 'worker-1', model: 'local-coder', status: 'running', created_at: Date.now(), stage: 'tool', step_index: 2 }], artifacts: [{ id: 'artifact', attempt_id: 'attempt-1', kind: 'test', path: 'checks.txt', validated: true }] } } }))
vi.mock('@/stores/atomic-tasks-store', () => ({ useAtomicTasks: () => state }))
vi.mock('@/i18n/react-i18next-compat', () => ({ useTranslation: () => ({ t: (key: string) => key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, translations) ?? key }) }))
describe('Recorded agent lanes', () => {
  beforeEach(() => { state.connection = 'connected' })
  it('switches layout while preserving recorded assignment and observed stage', () => {
    render(<AgentsPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Horizontal lanes' }))
    expect(screen.getByRole('button', { name: 'Horizontal lanes' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /Add bounded feature/ }))
    expect(screen.getByText('Edit only assigned files')).toBeInTheDocument()
    expect(screen.getByText('Run focused checks')).toBeInTheDocument()
    expect(screen.getByText('Checks pass')).toBeInTheDocument()
    expect(screen.getByText(/test · checks.txt · Validated/)).toBeInTheDocument()
    expect(screen.getAllByText(/Executing tool · Step 3/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Detailed tool activity is unavailable/)).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })
  it('keeps historical records available while disconnected', () => {
    state.connection = 'reconnecting'
    render(<AgentsPanel />)
    expect(screen.getByRole('button', { name: /Add bounded feature/ })).toBeEnabled()
    expect(screen.getByText(/local-coder · wsl · busy/)).toBeInTheDocument()
  })
  it('shows newer worker stages and only the available public tool results', () => {
    const original = structuredClone(state.snapshot)
    Object.assign(state.snapshot.attempts[0], { stage: 'preparing_tool', current_tool: 'read_file', step_count: 3 })
    Object.assign(state.snapshot, { tool_executions: [{ id: 'tool-1', attempt_id: 'attempt-1', status: 'succeeded', started_at: 0, finished_at: 100, exit_code: 0, argv: ['do not render'], stdout: 'private journal' }], approvals: [] })
    render(<AgentsPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Add bounded feature/ }))
    expect(screen.getAllByText(/Preparing tool/).length).toBeGreaterThan(0)
    expect(screen.getByText('Current tool: read_file')).toBeInTheDocument()
    fireEvent.click(screen.getByText('tool-1 · succeeded'))
    expect(screen.getByText('Exit code: 0')).toBeVisible()
    expect(screen.queryByText(/private journal|do not render/)).not.toBeInTheDocument()
    expect(screen.getByText(/Tool output and file diffs are not available/)).toBeInTheDocument()
    Object.assign(state, { snapshot: original })
  })
})
