import { useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  IconLock,
  IconLockOpen,
  IconPackageImport,
  IconPlus,
  IconRotateClockwise,
} from '@tabler/icons-react'
import HeaderPage from '@/containers/HeaderPage'
import { Button } from '@/components/ui/button'
import { Chip } from './Chip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useServiceHub } from '@/hooks/useServiceHub'
import { PanelBoard } from './PanelBoard'
import { builtinPanels, listCustomPanels, mergeRegistry } from './registry'
import { useBoard } from './useBoard'

/**
 * The container that holds the panel board.
 *
 * Deliberately not window chrome. The window already has its own: on Windows
 * `WindowFrame` draws the title strip, drag region and the
 * Minimize / Maximize / Close buttons (`decorations: false` there), and on
 * macOS and Linux the native frame stays with an overlay title bar. This shell
 * sits inside all of that and only holds panels, which is why it takes its
 * title row from `HeaderPage` like every other route — that is also where the
 * macOS drag region and traffic-light padding come from, in one place.
 */
export function WorkspaceShell() {
  const serviceHub = useServiceHub()
  const open = useBoard((state) => state.open)
  const locked = useBoard((state) => state.locked)
  const setLocked = useBoard((state) => state.setLocked)
  const addPanel = useBoard((state) => state.addPanel)
  const reset = useBoard((state) => state.reset)

  const [available, setAvailable] = useState<{ id: string; name: string }[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)

  const openSet = useMemo(() => new Set(open), [open])

  const loadAvailable = async () => {
    const custom = await listCustomPanels().catch(() => ({ installed: [], broken: [] }))
    setAvailable(
      mergeRegistry(builtinPanels(), custom.installed)
        .filter((entry) => !openSet.has(entry.id))
        .map((entry) => ({ id: entry.id, name: entry.name }))
    )
  }

  const install = async () => {
    setNotice(null)
    // The native folder picker lives on this side, the same division
    // `agent_import_skill` already uses.
    const picked = await serviceHub.dialog().open({ directory: true, multiple: false })
    const source = Array.isArray(picked) ? picked[0] : picked
    if (!source) return
    try {
      const manifest = await invoke<{ id: string; name: string }>('panels_install', {
        sourcePath: source,
      })
      addPanel(`panel:${manifest.id}`)
      setRefreshKey((key) => key + 1)
      setNotice(`Installed ${manifest.name}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <HeaderPage>
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-studio text-base font-medium">Workspace</span>
            <Chip>
              {open.length} {open.length === 1 ? 'panel' : 'panels'}
            </Chip>
          </div>
          <div className="flex items-center gap-1">
            <Popover onOpenChange={(isOpen) => isOpen && void loadAvailable()}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm">
                  <IconPlus className="size-3.5" /> Add panel
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-2">
                {available.length === 0 ? (
                  <div className="p-1 text-xs text-muted-foreground">
                    Everything is already on the board.
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {available.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => addPanel(entry.id)}
                        className="cursor-pointer rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                      >
                        {entry.name}
                      </button>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>

            <Button variant="ghost" size="sm" onClick={() => void install()}>
              <IconPackageImport className="size-3.5" /> Install
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setLocked(!locked)}
              aria-label={locked ? 'Unlock layout' : 'Lock layout'}
              title={locked ? 'Unlock layout' : 'Lock layout'}
            >
              {locked ? (
                <IconLock className="size-4 text-muted-foreground" />
              ) : (
                <IconLockOpen className="size-4 text-muted-foreground" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={reset}
              aria-label="Reset layout"
              title="Reset layout"
            >
              <IconRotateClockwise className="size-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </HeaderPage>

      {notice && (
        <div className="shrink-0 border-b border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
          {notice}
        </div>
      )}

      {/* min-h-0 so the board scrolls inside itself instead of stretching the
          page — the whole point of a dockable layout is that the tiles own
          their scrolling. */}
      <div data-region="Panel board" className="min-h-0 flex-1 overflow-hidden p-2">
        <PanelBoard refreshKey={refreshKey} />
      </div>
    </div>
  )
}
