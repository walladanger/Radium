import { useState } from 'react'
import { openPanelWorkspace } from './openWorkspace'

/** Desktop sidebar entry focuses the singleton editor rather than mounting a second board. */
export function WorkspaceLauncher() {
  const [error, setError] = useState<string | null>(null)
  return <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
    <h1 className="text-lg font-medium">Panel workspace</h1>
    <p className="max-w-md text-center text-sm text-muted-foreground">Open your panels in a separate window. Chat and running models stay in Radium.</p>
    <button className="rounded border border-border px-4 py-2 text-sm hover:bg-accent" onClick={() => {
      setError(null)
      void openPanelWorkspace().catch((cause: unknown) => setError(String(cause)))
    }}>Open workspace</button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}
