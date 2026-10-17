import { create } from 'zustand'
import { AtomicAgUiProjection } from '@/lib/atomic-ag-ui'
import { AtomicControlClient, type ControlSnapshot } from '@/lib/atomic-control'

type Connection = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
const agUi = new AtomicAgUiProjection()
export const subscribeAtomicAgUi = agUi.subscribe.bind(agUi)

type TasksState = {
  agUiEnabled: boolean
  setAgUiEnabled: (enabled: boolean) => void
  connection: Connection
  snapshot: ControlSnapshot | null
  error: string | null
  busy: boolean
  connect: (base: string, token: string) => Promise<void>
  disconnect: () => void
  command: (command: Record<string, unknown>, revision?: number) => Promise<boolean>
}
let client: AtomicControlClient | null = null
let session: AbortController | null = null

function delay(signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve() }
    const timer = setTimeout(finish, 2000)
    signal.addEventListener('abort', finish, { once: true })
    if (signal.aborted) finish()
  })
}

/** Credentials stay in the client closure; this store is deliberately not persisted. */
export const useAtomicTasks = create<TasksState>((set) => ({
  agUiEnabled: false,
  setAgUiEnabled: enabled => {
    agUi.setEnabled(enabled, useAtomicTasks.getState().snapshot)
    set({ agUiEnabled: enabled })
  },
  connection: 'disconnected', snapshot: null, error: null, busy: false,
  disconnect: () => {
    session?.abort()
    agUi.reset()
    session = null
    client = null
    set({ connection: 'disconnected', snapshot: null, error: null, busy: false })
  },
  connect: async (base, token) => {
    session?.abort()
    agUi.reset()
    const controller = new AbortController()
    session = controller
    const active = () => session === controller && !controller.signal.aborted
    set({ connection: 'connecting', snapshot: null, error: null, busy: false })
    let current: AtomicControlClient
    try { current = new AtomicControlClient(base, token); client = current }
    catch (error) {
      client = null
      set({ connection: 'disconnected', error: String(error) })
      return
    }
    while (active()) {
      try {
        const snapshot = await current.snapshot(controller.signal)
        if (!active()) return
        set({ snapshot, connection: 'connected', error: null })
        let cursor = snapshot.sequence
        await current.events(cursor, controller.signal, async event => {
          if (!active() || event.sequence <= cursor) return
          const fresh = await current.snapshot(controller.signal)
          if (!active()) return
          if (fresh.sequence < event.sequence) throw new Error('Controller snapshot is behind its event stream')
          cursor = fresh.sequence
          agUi.publishEvent(event)
          set(state => ({ snapshot: !state.snapshot || fresh.sequence >= state.snapshot.sequence ? fresh : state.snapshot, connection: 'connected', error: null }))
        })
        if (active()) set({ connection: 'reconnecting', error: 'Event stream disconnected; displayed state may be stale' })
      } catch (error) {
        if (active()) set({ connection: 'reconnecting', error: String(error) })
      }
      if (active()) await delay(controller.signal)
    }
  },
  command: async (command, revision) => {
    const current = client
    const controller = session
    if (!current || !controller || useAtomicTasks.getState().connection !== 'connected' || useAtomicTasks.getState().busy) return false
    set({ busy: true, error: null })
    try {
      await current.command(command, revision, crypto.randomUUID(), controller.signal)
      const snapshot = await current.snapshot(controller.signal)
      if (session !== controller) return false
      set(state => ({ snapshot: !state.snapshot || snapshot.sequence >= state.snapshot.sequence ? snapshot : state.snapshot }))
      return true
    } catch (error) {
      if (session === controller) {
        // A rejected revision may mean another interface already changed this object.
        try {
          const fresh = await current.snapshot(controller.signal)
          if (session === controller) set(state => ({ snapshot: !state.snapshot || fresh.sequence >= state.snapshot.sequence ? fresh : state.snapshot }))
        } catch { /* Preserve the original command error and last recorded state. */ }
        if (session === controller) set({ error: String(error) })
      }
      return false
    } finally {
      if (session === controller) set({ busy: false })
    }
  },
}))

// Subscribe to committed native state; the adapter cannot become a second task ledger.
useAtomicTasks.subscribe((state, previous) => {
  if (state.snapshot && state.snapshot !== previous.snapshot) agUi.publishSnapshot(state.snapshot)
})
