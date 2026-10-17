import type { ControlEvent, ControlSnapshot } from './atomic-control'
import { isAtomicStage } from './atomic-stages'

/** State/custom subset of AG-UI; this is not a RunAgentInput executor. */
export type AtomicAgUiEvent =
  | { type: 'STATE_SNAPSHOT'; snapshot: { atomicControl: Record<string, unknown> } }
  | { type: 'CUSTOM'; timestamp: number; name: 'atomic.control.transition'; value: { sequence: number; eventId: string; eventType: string; taskId?: string; attemptId?: string; workerId?: string; serviceId?: string; model?: string; stage?: string; stepIndex?: number } }

type Listener = (event: AtomicAgUiEvent) => void
const pick = (value: Record<string, unknown>, fields: string[]) => Object.fromEntries(fields.filter(key => key in value).map(key => [key, structuredClone(value[key])]))

/** Explicitly copy display fields: arbitrary payloads and reasoning never cross this adapter. */
export function agUiSnapshot(snapshot: ControlSnapshot): AtomicAgUiEvent {
  return { type: 'STATE_SNAPSHOT', snapshot: { atomicControl: {
    schema_version: snapshot.schema_version, sequence: snapshot.sequence,
    plans: snapshot.plans.map(value => pick(value, ['id', 'project_id', 'title', 'revision', 'status', 'created_at'])),
    tasks: snapshot.tasks.map(value => pick(value, ['id', 'plan_id', 'title', 'description', 'role', 'dependencies', 'write_scopes', 'revision', 'status', 'scheduled_at', 'created_at'])),
    attempts: snapshot.attempts.map(value => pick(value, ['id', 'task_id', 'worker_id', 'model', 'role', 'status', 'created_at', 'finished_at', 'service_id', 'stage', 'step_index'])),
    workers: snapshot.workers.map(value => pick(value, ['id', 'host_id', 'capabilities', 'model', 'status'])),
    approvals: snapshot.approvals.map(value => pick(value, ['id', 'task_id', 'attempt_id', 'kind', 'description', 'status', 'revision', 'expires_at'])),
    artifacts: snapshot.artifacts.map(value => pick(value, ['id', 'task_id', 'attempt_id', 'kind', 'path', 'validated'])),
    candidates: snapshot.candidates.map(value => pick(value, ['id', 'plan_id', 'base_commit', 'candidate_commit', 'status'])),
  } } }
}

/** In-process, opt-in projection. Consumers cannot submit commands through it. */
export class AtomicAgUiProjection {
  private enabled = false
  private snapshotSequence = -1
  private eventSequence = -1
  private listeners = new Set<Listener>()
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  setEnabled(enabled: boolean, snapshot: ControlSnapshot | null): void {
    this.enabled = enabled
    this.snapshotSequence = -1
    this.eventSequence = snapshot?.sequence ?? -1
    if (enabled && snapshot) this.publishSnapshot(snapshot)
  }
  reset(): void { this.snapshotSequence = -1; this.eventSequence = -1 }
  publishSnapshot(snapshot: ControlSnapshot): void {
    if (!this.enabled || snapshot.sequence <= this.snapshotSequence) return
    this.snapshotSequence = snapshot.sequence
    this.emit(agUiSnapshot(snapshot))
  }
  publishEvent(event: ControlEvent): void {
    if (!this.enabled || event.sequence <= this.eventSequence) return
    this.eventSequence = event.sequence
    const task = event.task_id ?? event.payload.task_id
    const attempt = event.attempt_id ?? event.payload.attempt_id
    const observed: Record<string, string | number> = {}
    if (event.event_type === 'agent_progress') {
      for (const [source, target] of [['worker_id', 'workerId'], ['service_id', 'serviceId'], ['model', 'model']]) {
        const value = event.payload[source]
        if (typeof value === 'string') observed[target] = value
      }
      if (isAtomicStage(event.payload.stage)) observed.stage = event.payload.stage
      if (typeof event.payload.step_index === 'number' && Number.isInteger(event.payload.step_index) && event.payload.step_index >= 0) observed.stepIndex = event.payload.step_index
    }
    this.emit({ type: 'CUSTOM', timestamp: event.created_at, name: 'atomic.control.transition', value: {
      sequence: event.sequence, eventId: event.event_id, eventType: event.event_type, ...observed,
      ...(typeof task === 'string' ? { taskId: task } : {}),
      ...(typeof attempt === 'string' ? { attemptId: attempt } : {}),
    } })
  }
  private emit(event: AtomicAgUiEvent): void {
    for (const listener of this.listeners) {
      try { listener(structuredClone(event)) } catch { /* Optional consumers cannot break native Tasks. */ }
    }
  }
}
