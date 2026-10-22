import { useState } from 'react'
import { PanelsTopLeft } from 'lucide-react'
import { openPanelWorkspace } from './openWorkspace'

/** Explicit desktop-only entry to the panel workspace. Creation failures remain visible beside the action. */
export function ExtendWorkspaceButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!IS_TAURI || IS_IOS || IS_ANDROID) return null
  return <div className="relative">
    <button type="button" className={className} disabled={busy} aria-label="Extend workspace"
      title="Extend workspace" onClick={async () => {
        setBusy(true); setError(null)
        try { await openPanelWorkspace() }
        catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
        finally { setBusy(false) }
      }}><PanelsTopLeft className="size-4" /></button>
    {error && <div role="alert" className="absolute right-0 top-full z-50 mt-2 w-72 rounded border border-border bg-popover p-3 text-xs text-popover-foreground">
      {error}<button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button>
    </div>}
  </div>
}
