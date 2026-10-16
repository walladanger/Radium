import { Fragment, useEffect, useMemo, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { BrokenPanelNotice, PanelFrame } from './PanelFrame'
import { PanelTile } from './PanelTile'
import { builtinPanels, listCustomPanels, mergeRegistry, type PanelListing } from './registry'
import { useBoard } from './useBoard'
import type { PanelDescriptor } from './types'
import { LayoutControls, SpatialBoard } from './SpatialBoard'

/**
 * Existing panel hosts, presented in split, Windows or Canvas layout.
 * Layout never changes the iframe sandbox or the backend permission contract.
 */
export function PanelBoard({ refreshKey, statusReady = true }: { refreshKey?: number; statusReady?: boolean }) {
  const open = useBoard((state) => state.open)
  const instances = useBoard((state) => state.panels)
  const mode = useBoard((state) => state.mode)
  const locked = useBoard((state) => state.locked)
  const closePanel = useBoard((state) => state.closePanel)
  const [listing, setListing] = useState<PanelListing | null>(null)

  useEffect(() => {
    let cancelled = false
    listCustomPanels()
      .then((value) => {
        if (!cancelled) setListing(value)
      })
      // A failure here means no custom panels, not a broken board: the
      // built-ins still render.
      .catch(() => {
        if (!cancelled) setListing({ installed: [], broken: [] })
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const registry = useMemo(() => {
    const entries = mergeRegistry(builtinPanels(), listing?.installed ?? [])
    return new Map(entries.map((entry) => [entry.id, entry]))
  }, [listing])

  const broken = useMemo(
    () => new Map((listing?.broken ?? []).map((entry) => [`panel:${entry.id}`, entry])),
    [listing]
  )

  const definitionId = (id: string) => instances[id]?.definitionId ?? id
  const titleFor = (id: string) => registry.get(definitionId(id))?.name ?? id
  if (mode !== 'split') {
    return <SpatialBoard titleFor={titleFor} renderPanel={(id) => <PanelContent
      descriptor={registry.get(definitionId(id))} broken={broken.get(definitionId(id))} statusReady={statusReady} />} />
  }

  if (open.length === 0) {
    return (
      <div className="flex size-full flex-col"><LayoutControls /><div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        No panels open. Add one from the toolbar.
      </div></div>
    )
  }

  return (
    <div className="flex size-full min-h-0 flex-col"><LayoutControls />
    <PanelGroup direction="horizontal" id="panel-board">
      {open.map((id, index) => (
        <Fragment key={id}>
          {index > 0 && (
            <PanelResizeHandle
              disabled={locked}
              aria-label="Resize panels"
              className={`group relative z-20 mx-1 w-1.5 rounded-full bg-transparent outline-none transition-colors hover:bg-border focus-visible:bg-border ${
                locked ? 'cursor-default' : 'cursor-ew-resize'
              }`}
            />
          )}
          <Panel minSize={15} order={index}>
            <BoardTile
              id={id}
              descriptor={registry.get(definitionId(id))}
              broken={broken.get(definitionId(id))}
              onClose={() => closePanel(id)}
              statusReady={statusReady}
            />
          </Panel>
        </Fragment>
      ))}
    </PanelGroup>
    </div>
  )
}

function BoardTile({
  id,
  descriptor,
  broken,
  onClose,
  statusReady,
}: {
  id: string
  descriptor?: PanelDescriptor
  broken?: { id: string; errors: string[] }
  onClose: () => void
  statusReady: boolean
}) {
  return <PanelTile title={descriptor?.name ?? id} onClose={onClose}>
    <PanelContent descriptor={descriptor} broken={broken} statusReady={statusReady} />
  </PanelTile>
}

function PanelContent({ descriptor, broken, statusReady }: {
  descriptor?: PanelDescriptor
  broken?: { id: string; errors: string[] }
  statusReady: boolean
}) {
  if (!statusReady && descriptor?.kind === 'builtin' && descriptor.id !== 'builtin:panels') {
    return <div role="status" className="p-3 text-xs text-muted-foreground">Main window status is unavailable. Reopen the main window to reconnect.</div>
  }
  // A broken panel keeps its tile and shows why, rather than vanishing and
  // leaving the user to wonder where it went.
  if (broken) {
    return (
        <BrokenPanelNotice panel={broken} />
    )
  }

  // An id in the board that no longer resolves — a custom panel removed on
  // disk, say — is said plainly, with the way to clear it.
  if (!descriptor) {
    return (
        <div className="p-3 text-xs text-muted-foreground">
          This panel is no longer installed. Close the tile to remove it from the board.
        </div>
    )
  }

  const Component = descriptor.component
  return (
    <>
      {descriptor.kind === 'custom' && descriptor.manifest ? (
        <PanelFrame panel={descriptor.manifest} />
      ) : Component ? (
        <Component />
      ) : null}
    </>
  )
}
