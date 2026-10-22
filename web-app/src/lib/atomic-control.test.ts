import { afterEach, describe, expect, it, vi } from 'vitest'
import { AtomicControlClient, ControlEventDecoder, localControlUrl, snapshotSchema, taskColumns } from './atomic-control'

const empty = { schema_version: 1, sequence: 0, plans: [], tasks: [], attempts: [], workers: [], approvals: [], artifacts: [], candidates: [] }
const event = { sequence: 1, event_id: 'e1', event_type: 'plan_created', created_at: 100, payload: {} }
const task = (id: string, dependencies: string[] = []) => ({ id, plan_id: 'p', title: id, description: '', role: 'edit', dependencies, write_scopes: [], revision: 1, status: 'ready' as const, created_at: 100 })

afterEach(() => vi.unstubAllGlobals())

describe('local controller boundary', () => {
  it('accepts older snapshots and strips private fields from tool activity', () => {
    expect(snapshotSchema.parse(empty).tool_executions).toBeUndefined()
    const parsed = snapshotSchema.parse({ ...empty, tool_executions: [{ id: 'tool', attempt_id: 'attempt', status: 'succeeded', started_at: 0, exit_code: 0, fencing_token: 77, argv: ['private'], stdout: 'private' }] })
    expect(parsed.tool_executions).toEqual([{ id: 'tool', attempt_id: 'attempt', status: 'succeeded', started_at: 0, exit_code: 0 }])
  })
  it('calls the native fetch with its global receiver', async () => {
    vi.stubGlobal('fetch', function (this: unknown) {
      expect(this).toBe(globalThis)
      return Promise.resolve(new Response(JSON.stringify(empty)))
    })
    await expect(new AtomicControlClient('http://localhost:17432', 'fixture').snapshot()).resolves.toEqual(empty)
  })
  it('accepts loopback origins and rejects credential destinations and redirects', async () => {
    expect(localControlUrl('http://127.0.0.1:17432')).toBe('http://127.0.0.1:17432')
    expect(localControlUrl('http://[::1]:17432')).toBe('http://[::1]:17432')
    for (const url of ['https://localhost', 'http://example.com', 'http://localhost.evil.test', 'http://token@localhost', 'http://localhost/secret', 'http://localhost?token=x']) expect(() => localControlUrl(url)).toThrow()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(empty)))
    const client = new AtomicControlClient('http://localhost:17432', 'secret', fetcher)
    await client.snapshot()
    expect(fetcher).toHaveBeenCalledWith('http://localhost:17432/v1/control/snapshot', expect.objectContaining({ redirect: 'error', credentials: 'omit', headers: { Authorization: 'Bearer secret' } }))
  })
  it('rejects incompatible state instead of displaying fabricated progress', () => {
    expect(snapshotSchema.parse(empty).sequence).toBe(0)
    expect(() => snapshotSchema.parse({ ...empty, schema_version: 2 })).toThrow()
    expect(() => snapshotSchema.parse({ ...empty, tasks: [{ ...task('a'), status: 'made_up' }] })).toThrow()
  })
  it('sends revision and stable command identity in the body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))
    const client = new AtomicControlClient('http://localhost:17432', 'secret', fetcher)
    await client.command({ type: 'pause_plan', plan_id: 'p' }, 3, 'same-command')
    const init = fetcher.mock.calls[0][1]
    expect(JSON.parse(String(init?.body))).toEqual({ command_id: 'same-command', expected_revision: 3, command: { type: 'pause_plan', plan_id: 'p' } })
  })
  it('decodes arbitrary SSE chunk boundaries and ignores keepalives', () => {
    const decoder = new ControlEventDecoder()
    const wire = `: heartbeat\r\n\r\nevent: control\r\nid: 1\r\ndata: ${JSON.stringify(event)}\r\n\r\n`
    const result = [...wire].flatMap(character => decoder.push(character))
    expect(result).toEqual([event])
  })
  it('rejects malformed events and limits unfinished frames', () => {
    expect(() => new ControlEventDecoder().push('event: control\ndata: {}\n\n')).toThrow()
    expect(() => new ControlEventDecoder().push('x'.repeat(1024 * 1024 + 1))).toThrow()
  })
  it('streams with authentication and a saved cursor', async () => {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(`event: control\ndata: ${JSON.stringify(event)}\n\n`)); controller.close() } })
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }))
    const received = vi.fn().mockResolvedValue(undefined)
    await new AtomicControlClient('http://localhost:17432', 'secret', fetcher).events(42, new AbortController().signal, received)
    expect(fetcher.mock.calls[0][0]).toBe('http://localhost:17432/v1/control/events?after=42')
    expect(fetcher.mock.calls[0][1]?.headers).toEqual({ Authorization: 'Bearer secret', Accept: 'text/event-stream' })
    expect(received).toHaveBeenCalledWith(event)
  })
})

describe('dependency graph layout', () => {
  it('places a join after all prerequisites', () => {
    expect(taskColumns([task('join', ['a', 'b']), task('a'), task('b')]).map(column => column.map(item => item.id))).toEqual([['a', 'b'], ['join']])
  })
  it('does not hang or hide a malformed cycle', () => {
    expect(taskColumns([task('a', ['b']), task('b', ['a'])]).flat().map(item => item.id)).toEqual(['a', 'b'])
  })
})
