import { useEffect, useState, type ReactNode } from 'react'
import { useBoard } from './useBoard'

/** Only one webview may edit the local workspace until the native coordinator is introduced. */
export function WorkspaceLease({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState('Opening workspace…')
  const [owned, setOwned] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!navigator.locks) {
      setStatus('This workspace requires Web Locks support to prevent competing editors.')
      return
    }
    let cancelled = false
    let release: (() => void) | undefined
    void navigator.locks.request('radium-panel-workspace-v1', { ifAvailable: true }, async (lock) => {
      if (cancelled) return
      if (!lock) {
        setStatus('Workspace is already open in another window. Close it there, then try again.')
        return
      }
      // Re-read after acquiring ownership; this webview may have imported the store before the last editor closed.
      await useBoard.persist.rehydrate()
      if (cancelled) return
      if (!useBoard.persist.hasHydrated()) {
        setStatus('Saved workspace could not be read. Its data has been preserved. Use a compatible Radium version or restore the backup.')
        return
      }
      setOwned(true)
      await new Promise<void>((resolve) => { release = resolve })
    }).catch((error: unknown) => {
      if (!cancelled) setStatus(error instanceof Error ? error.message : String(error))
    })
    return () => { cancelled = true; release?.() }
  }, [attempt])
  if (owned) return <>{children}</>
  return <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-sm">
    <p role="status">{status}</p>
    <button type="button" className="rounded border border-border px-3 py-1" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
  </div>
}
