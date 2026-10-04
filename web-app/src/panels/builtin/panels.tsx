import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IconFolderOpen, IconPuzzle, IconRefresh, IconTrash } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Chip } from '../Chip'
import { listCustomPanels, type PanelListing } from '../registry'
import type { BuiltinPanel } from '../registry'

/**
 * The panel manager, as a panel.
 *
 * Shows what is installed, what failed and why, and what each panel asked
 * for. The permissions are the reason this is worth a screen rather than a
 * menu: a panel declares them in its manifest, and this is where someone can
 * read what they agreed to after the fact.
 */
function PanelsOverview() {
  const [listing, setListing] = useState<PanelListing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      setListing(await listCustomPanels())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const remove = async (id: string) => {
    setBusy(true)
    try {
      await invoke('panels_remove', { id })
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const openFolder = async () => {
    try {
      // The command returns the path and creates it if missing, so there is
      // somewhere to drop a folder even on a fresh install.
      const path = await invoke<string>('panels_open_folder')
      await invoke('open_file_explorer', { path }).catch(() => {
        // Not every platform build exposes a reveal command; showing the path
        // is still useful, so this is not an error worth surfacing.
        setError(`Panels live in ${path}`)
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="space-y-3 p-3 text-xs">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={busy}>
          <IconRefresh className="size-3.5" /> Refresh
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void openFolder()}>
          <IconFolderOpen className="size-3.5" /> Panels folder
        </Button>
      </div>

      {error && <div className="text-destructive">{error}</div>}

      {listing === null && !error && <div className="text-muted-foreground">Loading…</div>}

      {listing?.installed.length === 0 && listing?.broken.length === 0 && (
        <div className="text-muted-foreground">
          No custom panels installed. A panel is a folder with a{' '}
          <code className="font-mono">panel.json</code> and an HTML file.
        </div>
      )}

      {listing?.installed.map((panel) => (
        <div key={panel.id} className="space-y-1 rounded-md border border-border p-2">
          <div className="flex items-center gap-1.5">
            <IconPuzzle className="size-3.5 text-primary" />
            <span className="font-semibold">{panel.name}</span>
            <span className="font-mono text-muted-foreground">{panel.version}</span>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${panel.id}`}
              disabled={busy}
              onClick={() => void remove(panel.id)}
            >
              <IconTrash className="size-3.5" />
            </Button>
          </div>
          {panel.description && <div className="text-muted-foreground">{panel.description}</div>}
          <div className="flex flex-wrap items-center gap-1">
            {panel.permissions.length === 0 ? (
              <Chip tone="muted">no permissions</Chip>
            ) : (
              panel.permissions.map((permission) => (
                <Chip key={permission}>{permission}</Chip>
              ))
            )}
            {panel.mcpServers.map((server) => (
              <Chip key={server} tone="muted">
                mcp: {server}
              </Chip>
            ))}
          </div>
        </div>
      ))}

      {listing?.broken.map((panel) => (
        <div
          key={panel.id}
          className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-2"
        >
          <div className="flex items-center gap-1.5 font-semibold text-destructive">
            <span className="font-mono">{panel.id}</span>
            <Chip tone="bad">broken</Chip>
          </div>
          {panel.errors.map((message, index) => (
            <div key={index} className="text-muted-foreground">
              {message}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export const panel: BuiltinPanel = {
  id: 'panels',
  name: 'Panels',
  component: PanelsOverview,
  defaultSize: { w: 5, h: 8 },
}
