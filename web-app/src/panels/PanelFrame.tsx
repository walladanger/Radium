import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IconAlertCircle, IconLoader2 } from '@tabler/icons-react'
import { useTheme } from '@/hooks/useTheme'
import type { BrokenPanel, PanelManifest } from './registry'

/**
 * Hosts one custom panel.
 *
 * The panel runs in an iframe with `sandbox="allow-scripts"` on the
 * `panel://` origin: an opaque origin, no host IPC, no file system, and the
 * response CSP forbids the network. Everything it can do arrives here as a
 * `postMessage` and goes to `panels_request`, where the bridge authorises it
 * against the panel's own manifest. Nothing in this component decides what a
 * panel may do — if it looks like it does, that is a bug.
 */
export function PanelFrame({ panel }: { panel: PanelManifest }) {
  const frame = useRef<HTMLIFrameElement | null>(null)
  const [ready, setReady] = useState(false)
  const isDark = useTheme((state) => state.isDark)
  const theme = isDark ? 'dark' : 'light'

  // Kept in a ref as well so the message handler does not need re-binding on
  // every theme change — re-binding mid-request would drop the reply.
  const themeRef = useRef(theme)
  themeRef.current = theme

  const post = useCallback((message: unknown) => {
    frame.current?.contentWindow?.postMessage(message, '*')
  }, [])

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      // Only this panel's own frame is trusted. Without this check any other
      // frame on the page could speak for it.
      if (!frame.current || event.source !== frame.current.contentWindow) return
      const message = event.data
      if (!message || typeof message !== 'object') return

      if (message.type === 'panel:ready') {
        setReady(true)
        return
      }
      if (message.type !== 'panel:request') return

      try {
        const response = await invoke('panels_request', {
          panelId: panel.id,
          method: message.method,
          params: message.params ?? {},
          theme: themeRef.current,
        })
        post({ type: 'host:response', id: message.id, ...(response as object) })
      } catch (error) {
        // An invoke that throws is a host problem, not a denial; say so with
        // the code the contract reserves for it.
        post({
          type: 'host:response',
          id: message.id,
          ok: false,
          code: 'handler_error',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [panel.id, post])

  // Push the theme after load and on every change, so a panel linking
  // panel-theme.css follows the app without asking.
  useEffect(() => {
    if (ready) post({ type: 'host:theme', theme })
  }, [theme, ready, post])

  const onLoad = () => {
    post({ type: 'host:init', theme })
    // A panel that never calls ready() should not spin forever; it may simply
    // be a static page.
    window.setTimeout(() => setReady(true), 1200)
  }

  return (
    <div className="relative size-full">
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <IconLoader2 className="size-4 animate-spin" />
        </div>
      )}
      <iframe
        ref={frame}
        title={panel.name}
        src={`panel://${panel.id}/`}
        onLoad={onLoad}
        sandbox="allow-scripts"
        className="size-full border-0 bg-transparent"
      />
    </div>
  )
}

/**
 * What a panel that failed to load shows instead. The errors are the point:
 * a panel that silently fails to appear is far harder to fix than one that
 * says what is wrong with it.
 */
export function BrokenPanelNotice({ panel }: { panel: BrokenPanel }) {
  return (
    <div className="flex size-full flex-col gap-1.5 overflow-auto p-3 text-xs">
      <div className="flex items-center gap-1.5 font-semibold text-destructive">
        <IconAlertCircle className="size-4" />
        {panel.id} failed to load
      </div>
      {panel.errors.map((error, index) => (
        <div key={index} className="text-muted-foreground">
          {error}
        </div>
      ))}
    </div>
  )
}
