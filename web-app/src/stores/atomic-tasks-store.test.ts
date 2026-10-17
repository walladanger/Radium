import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribeAtomicAgUi, useAtomicTasks } from './atomic-tasks-store'

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), events: vi.fn(), command: vi.fn() }))
vi.mock('@/lib/atomic-control', () => ({ AtomicControlClient: class {
  constructor(_base: string, private token: string) {}
  snapshot(signal: AbortSignal) { return mocks.snapshot(this.token, signal) }
  events(cursor: number, signal: AbortSignal, callback: (event: { sequence: number }) => Promise<void>) { return mocks.events(cursor, signal, callback) }
  command(...args: unknown[]) { return mocks.command(...args) }
} }))
const snapshot = (sequence: number) => ({ schema_version: 1, sequence, plans: [], tasks: [], attempts: [], workers: [], approvals: [], artifacts: [], candidates: [] })
const waitStream = (_cursor: number, signal: AbortSignal) => new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
afterEach(() => { useAtomicTasks.getState().setAgUiEnabled(false); useAtomicTasks.getState().disconnect(); vi.resetAllMocks(); vi.useRealTimers() })

describe('Tasks connection state', () => {
  it('toggles projection without changing the native connection or commands', async () => {
    const projected = vi.fn()
    const unsubscribe = subscribeAtomicAgUi(projected)
    mocks.snapshot.mockResolvedValue(snapshot(1))
    mocks.events.mockImplementation(waitStream)
    mocks.command.mockResolvedValue(undefined)
    const run = useAtomicTasks.getState().connect('http://localhost:17432', 'fixture')
    await vi.waitFor(() => expect(useAtomicTasks.getState().connection).toBe('connected'))
    expect(projected).not.toHaveBeenCalled()
    useAtomicTasks.getState().setAgUiEnabled(true)
    expect(projected).toHaveBeenCalledTimes(1)
    useAtomicTasks.getState().setAgUiEnabled(false)
    await expect(useAtomicTasks.getState().command({ type: 'pause_plan', plan_id: 'p' }, 1)).resolves.toBe(true)
    expect(mocks.command).toHaveBeenCalledTimes(1)
    expect(projected).toHaveBeenCalledTimes(1)
    expect(useAtomicTasks.getState().connection).toBe('connected')
    unsubscribe()
    useAtomicTasks.getState().disconnect()
    await run
  })
  it('keeps recorded state during an outage and blocks commands until recovery', async () => {
    vi.useFakeTimers()
    mocks.snapshot.mockResolvedValueOnce(snapshot(5)).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(snapshot(8))
    mocks.events.mockResolvedValueOnce(undefined).mockImplementation(waitStream)
    const run = useAtomicTasks.getState().connect('http://localhost:17432', 'fixture')
    await vi.advanceTimersByTimeAsync(0)
    expect(useAtomicTasks.getState().connection).toBe('reconnecting')
    expect(useAtomicTasks.getState().snapshot?.sequence).toBe(5)
    await expect(useAtomicTasks.getState().command({ type: 'start_plan' }, 1)).resolves.toBe(false)
    expect(mocks.command).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(4000)
    expect(useAtomicTasks.getState().connection).toBe('connected')
    expect(useAtomicTasks.getState().snapshot?.sequence).toBe(8)
    useAtomicTasks.getState().disconnect()
    await run
  })
  it('refreshes authoritative state after a rejected revision and reports failure', async () => {
    mocks.snapshot.mockResolvedValueOnce(snapshot(10)).mockResolvedValueOnce(snapshot(11))
    mocks.events.mockImplementation(waitStream)
    mocks.command.mockRejectedValue(new Error('conflict: stale revision'))
    const run = useAtomicTasks.getState().connect('http://localhost:17432', 'fixture')
    await vi.waitFor(() => expect(useAtomicTasks.getState().connection).toBe('connected'))
    await expect(useAtomicTasks.getState().command({ type: 'pause_plan', plan_id: 'p' }, 1)).resolves.toBe(false)
    expect(useAtomicTasks.getState().snapshot?.sequence).toBe(11)
    expect(useAtomicTasks.getState().error).toContain('stale revision')
    expect(useAtomicTasks.getState().busy).toBe(false)
    useAtomicTasks.getState().disconnect()
    await run
  })

  it('ignores a late snapshot from a replaced connection and clears state on disconnect', async () => {
    let resolveOld: (value: ReturnType<typeof snapshot>) => void = () => undefined
    mocks.snapshot.mockImplementation((token: string) => token === 'old' ? new Promise(resolve => { resolveOld = resolve }) : Promise.resolve(snapshot(20)))
    mocks.events.mockImplementation(waitStream)
    const oldRun = useAtomicTasks.getState().connect('http://localhost:17432', 'old')
    const newRun = useAtomicTasks.getState().connect('http://localhost:17432', 'new')
    await vi.waitFor(() => expect(useAtomicTasks.getState().snapshot?.sequence).toBe(20))
    resolveOld(snapshot(1))
    await oldRun
    expect(useAtomicTasks.getState().snapshot?.sequence).toBe(20)
    expect(Object.values(useAtomicTasks.getState())).not.toContain('new')
    useAtomicTasks.getState().disconnect()
    await newRun
    expect(useAtomicTasks.getState().snapshot).toBeNull()
    expect(useAtomicTasks.getState().connection).toBe('disconnected')
  })
  it('deduplicates replayed events against the authoritative snapshot watermark', async () => {
    let acceptEvent: (event: { sequence: number }) => Promise<void> = async () => undefined
    mocks.snapshot.mockResolvedValueOnce(snapshot(10)).mockResolvedValueOnce(snapshot(12))
    mocks.events.mockImplementation((cursor, signal, callback) => { acceptEvent = callback; return waitStream(cursor, signal) })
    const run = useAtomicTasks.getState().connect('http://localhost:17432', 'test')
    await vi.waitFor(() => expect(useAtomicTasks.getState().connection).toBe('connected'))
    await acceptEvent({ sequence: 10 })
    expect(mocks.snapshot).toHaveBeenCalledTimes(1)
    await acceptEvent({ sequence: 11 })
    expect(useAtomicTasks.getState().snapshot?.sequence).toBe(12)
    await acceptEvent({ sequence: 12 })
    expect(mocks.snapshot).toHaveBeenCalledTimes(2)
    useAtomicTasks.getState().disconnect()
    await run
  })
})
