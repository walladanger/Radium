import type { ReactNode } from 'react'
import { IconX } from '@tabler/icons-react'

/**
 * One panel's frame on the board: a header strip and the panel's own content
 * below it.
 *
 * The header stops `mousedown` from propagating. Today nothing above it is a
 * Tauri drag region — `WindowFrame` keeps its drag strip in a sibling layer
 * and routes put their board beside `HeaderPage` rather than inside it — so
 * this is not load-bearing yet. It becomes load-bearing the moment this
 * header doubles as a panel drag handle (Phase 4) or a route nests a board
 * under `HeaderPage`, and the failure it prevents is the nasty kind: dragging
 * a panel would move the whole OS window instead. Tauri already excludes
 * `button`, `input`, `a`, `select` and `textarea` from drag regions, but not
 * `div`, which is why `HeaderPage` suppresses this event the same way.
 */
export function PanelTile({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose?: () => void
}) {
  return (
    <div className="flex size-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div
        data-panel-header
        className="flex shrink-0 items-center gap-1.5 border-b border-border bg-sidebar px-2.5 py-1.5"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
          {title}
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <IconX className="size-3.5" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  )
}
