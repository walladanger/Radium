import { Fragment, useEffect, useMemo, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { BrokenPanelNotice, PanelFrame } from './PanelFrame'
import { PanelTile } from './PanelTile'
import { builtinPanels, listCustomPanels, mergeRegistry, type PanelListing } from './registry'
import { useBoard } from './useBoard'
import type { PanelDescriptor } from './types'

/**
 * The board: the open panels, side by side, resizable.
 *
 * Horizontal split panes rather than a free-form drag grid. They are already a
 * dependency and already used by the agent workspace, they give
 * keyboard-resizable dividers for nothing, and nobody has yet wanted to drag a
 * panel to an arbitrary spot. A grid library can come later if that changes.
 */
export function PanelBoard({ refreshKey }: { refreshKey?: number }) {
  const open = useBoard((state) => state.open)
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

  if (open.length === 0) {
    return (
      <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
        No panels open. Add one from the toolbar.
      </div>
    )
  }

  return (
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
              descriptor={registry.get(id)}
              broken={broken.get(id)}
              onClose={() => closePanel(id)}
            />
          </Panel>
        </Fragment>
      ))}
    </PanelGroup>
  )
}

function BoardTile({
  id,
  descriptor,
  broken,
  onClose,
}: {
  id: string
  descriptor?: PanelDescriptor
  broken?: { id: string; errors: string[] }
  onClose: () => void
}) {
  // A broken panel keeps its tile and shows why, rather than vanishing and
  // leaving the user to wonder where it went.
  if (broken) {
    return (
      <PanelTile title={broken.id} onClose={onClose}>
        <BrokenPanelNotice panel={broken} />
      </PanelTile>
    )
  }

  // An id in the board that no longer resolves — a custom panel removed on
  // disk, say — is said plainly, with the way to clear it.
  if (!descriptor) {
    return (
      <PanelTile title={id} onClose={onClose}>
        <div className="p-3 text-xs text-muted-foreground">
          This panel is no longer installed. Close the tile to remove it from the board.
        </div>
      </PanelTile>
    )
  }

  const Component = descriptor.component
  return (
    <PanelTile title={descriptor.name} onClose={onClose}>
      {descriptor.kind === 'custom' && descriptor.manifest ? (
        <PanelFrame panel={descriptor.manifest} />
      ) : Component ? (
        <Component />
      ) : null}
    </PanelTile>
  )
}
