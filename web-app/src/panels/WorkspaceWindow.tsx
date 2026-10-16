import { useEffect } from 'react'
import { ServiceHubProvider } from '@/providers/ServiceHubProvider'
import { InterfaceProvider } from '@/providers/InterfaceProvider'
import { TranslationProvider } from '@/i18n/TranslationContext'
import { useTheme } from '@/hooks/useTheme'
import { WorkspaceShell } from './WorkspaceShell'
import { WorkspaceLease } from './WorkspaceLease'
import { usePanelStatusMirror } from './panelStatus'

function Appearance() {
  const isDark = useTheme((state) => state.isDark)
  useEffect(() => { document.documentElement.classList.toggle('dark', isDark) }, [isDark])
  return <InterfaceProvider />
}
function Contents() {
  const ready = usePanelStatusMirror()
  return <div className="flex h-svh flex-col bg-background text-foreground">
    {!ready && IS_TAURI && <div role="status" className="shrink-0 border-b border-border px-3 py-1 text-xs text-muted-foreground">
      Waiting for live status from the main window. Saved hardware information may be out of date.
    </div>}
    <div className="min-h-0 flex-1"><WorkspaceShell standalone statusReady={ready || !IS_TAURI} /></div>
  </div>
}

/** A presentation-only root: no extension loading, inference startup, chat, or global job coordinators. */
export function WorkspaceWindow() {
  return <WorkspaceLease><ServiceHubProvider><TranslationProvider>
    <Appearance /><Contents />
  </TranslationProvider></ServiceHubProvider></WorkspaceLease>
}
