import { z } from 'zod'

const id = z.string().min(1)
const revision = z.number().int().nonnegative()
export const taskSchema = z.object({
  id, plan_id: id, title: z.string(), description: z.string(), role: z.string(),
  dependencies: z.array(id), write_scopes: z.array(z.string()), revision,
  status: z.enum(['planned', 'ready', 'running', 'waiting_approval', 'verifying', 'completed', 'failed', 'cancelled', 'blocked']),
  scheduled_at: z.number().nullable().optional(), created_at: z.number(),
}).passthrough()
export const snapshotSchema = z.object({
  schema_version: z.literal(1), sequence: revision,
  plans: z.array(z.object({ id, project_id: id, title: z.string(), revision, status: z.enum(['draft', 'active', 'paused', 'completed', 'cancelled']), created_at: z.number() }).passthrough()),
  tasks: z.array(taskSchema),
  attempts: z.array(z.object({ id, task_id: id, worker_id: id, model: z.string(), role: z.string(), status: z.string(), created_at: z.number(), finished_at: z.number().nullable().optional() }).passthrough()),
  workers: z.array(z.object({ id, host_id: id, capabilities: z.array(z.string()), model: z.string(), status: z.string() }).passthrough()),
  approvals: z.array(z.object({ id, task_id: id, attempt_id: id, kind: z.string(), description: z.string(), status: z.string(), revision, expires_at: z.number() }).passthrough()),
  artifacts: z.array(z.object({ id, task_id: id, attempt_id: id, kind: z.string(), path: z.string(), validated: z.boolean() }).passthrough()),
  candidates: z.array(z.object({ id, plan_id: id, base_commit: z.string(), candidate_commit: z.string(), status: z.string() }).passthrough()),
  // Older controllers omit the filtered activity projection. Never render raw journals.
  tool_executions: z.array(z.object({ id, attempt_id: id, status: z.string(), started_at: z.number(), finished_at: z.number().nullable().optional(), exit_code: z.number().int().nullable().optional() }).strip()).optional(),
})
export type ControlSnapshot = z.infer<typeof snapshotSchema>
export type ControlTask = z.infer<typeof taskSchema>
const eventSchema = z.object({ sequence: revision, event_id: id, event_type: z.string(), created_at: z.number(), payload: z.record(z.string(), z.unknown()) }).passthrough()
export type ControlEvent = z.infer<typeof eventSchema>

/** Reject remote endpoints before attaching a local controller credential. */
export function localControlUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('A loopback HTTP controller address is required')
  }
  return url.origin
}

/** Incremental SSE decoder: handles CRLF, split UTF-8 input, comments and multiline data. */
export class ControlEventDecoder {
  private buffer = ''
  push(chunk: string): ControlEvent[] {
    this.buffer += chunk
    if (this.buffer.length > 1024 * 1024) throw new Error('Controller event exceeds the size limit')
    const events: ControlEvent[] = []
    let match: RegExpExecArray | null
    while ((match = /\r?\n\r?\n/.exec(this.buffer))) {
      const frame = this.buffer.slice(0, match.index)
      this.buffer = this.buffer.slice(match.index + match[0].length)
      const lines = frame.split(/\r?\n/)
      const kind = lines.find(line => line.startsWith('event:'))?.slice(6).trim()
      const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n')
      if (kind === 'control' && data) events.push(eventSchema.parse(JSON.parse(data)))
    }
    return events
  }
}

export class AtomicControlClient {
  private readonly base: string
  constructor(base: string, private readonly token: string, private readonly fetcher: typeof fetch = (...args) => globalThis.fetch(...args)) {
    this.base = localControlUrl(base)
    if (!token.trim()) throw new Error('Controller token is required')
  }
  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.fetcher(`${this.base}/v1/control/${path}`, {
      ...init, redirect: 'error', credentials: 'omit', cache: 'no-store',
      headers: { ...init.headers, Authorization: `Bearer ${this.token}` },
    })
    if (!response.ok) {
      const error = await response.json().catch(() => null)
      const parsed = z.object({ code: z.string(), message: z.string() }).safeParse(error)
      throw new Error(parsed.success ? `${parsed.data.code}: ${parsed.data.message}` : `Controller request failed (${response.status})`)
    }
    return response
  }
  async snapshot(signal?: AbortSignal): Promise<ControlSnapshot> {
    return snapshotSchema.parse(await (await this.request('snapshot', { signal })).json())
  }
  async command(command: Record<string, unknown>, expectedRevision?: number, commandId = crypto.randomUUID(), signal?: AbortSignal): Promise<void> {
    await this.request('commands', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command_id: commandId, expected_revision: expectedRevision, command }) })
  }
  async events(after: number, signal: AbortSignal, onEvent: (event: ControlEvent) => Promise<void>): Promise<void> {
    const response = await this.request(`events?after=${after}`, { signal, headers: { Accept: 'text/event-stream' } })
    if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw new Error('Controller did not return an event stream')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const frames = new ControlEventDecoder()
    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read()
        if (done) break
        for (const event of frames.push(decoder.decode(value, { stream: true }))) await onEvent(event)
      }
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }
}

/** Deterministic dependency columns; malformed cycles remain visible rather than hanging. */
export function taskColumns(tasks: ControlTask[]): ControlTask[][] {
  const pending = new Map(tasks.map(task => [task.id, task]))
  const placed = new Set<string>()
  const columns: ControlTask[][] = []
  while (pending.size) {
    const next = [...pending.values()].filter(task => task.dependencies.every(dep => placed.has(dep) || !pending.has(dep)))
    if (!next.length) { columns.push([...pending.values()]); break }
    columns.push(next)
    for (const task of next) { pending.delete(task.id); placed.add(task.id) }
  }
  return columns
}
