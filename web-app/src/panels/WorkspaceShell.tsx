import { useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { IconLock, IconLockOpen } from '@tabler/icons-react'
import HeaderPage from '@/containers/HeaderPage'
import { Button } from '@/components/ui/button'
import { PanelTile } from './PanelTile'

/**
 * The container that holds the panel board.
 *
 * Deliberately *not* window chrome. The window already has its own: on
 * Windows `WindowFrame` draws the title strip, drag region and the
 * Minimize / Maximize / Close buttons (`decorations: false` there), and on
 * macOS and Linux the native frame stays with an overlay title bar. This
 * shell sits inside all of that and only holds panels, which is why it takes
 * its title row from `HeaderPage` like every other route — that is also where
 * the macOS drag region and traffic-light padding come from, for free and in
 * one place.
 *
 * Phase 0 of the panel plan: the container, one placeholder tile, and a lock
 * that really locks. Adding, installing and removing panels arrive with the
 * registry and the sandboxed host in later phases; shipping buttons that do
 * nothing would be worse than leaving them out.
 */
export function WorkspaceShell() {
  const [locked, setLocked] = useState(false)

  return (
    <div className="flex h-full flex-col">
      <HeaderPage>
        <div className="flex w-full items-center justify-between">
          <span className="font-studio text-base font-medium">Workspace</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setLocked((value) => !value)}
            aria-label={locked ? 'Unlock layout' : 'Lock layout'}
            title={locked ? 'Unlock layout' : 'Lock layout'}
          >
            {locked ? (
              <IconLock className="size-4 text-muted-foreground" />
            ) : (
              <IconLockOpen className="size-4 text-muted-foreground" />
            )}
          </Button>
        </div>
      </HeaderPage>

      {/* min-h-0 so the board scrolls inside itself instead of stretching the
          page — the whole point of a dockable layout is that the tiles own
          their scrolling. */}
      <div
        data-region="Panel board"
        className="min-h-0 flex-1 overflow-hidden p-2"
      >
        <PanelGroup direction="horizontal" id="workspace-board">
          <Panel defaultSize={65} minSize={20} order={1}>
            <PanelTile title="Panels">
              <div className="space-y-2 p-3 text-xs text-muted-foreground">
                <p>
                  The board is here. Panels land in it as the registry and the
                  sandboxed host come online.
                </p>
                <p>
                  Drag the divider to resize. Arrow keys work once the handle
                  has focus.
                </p>
              </div>
            </PanelTile>
          </Panel>
          <PanelResizeHandle
            disabled={locked}
            aria-label="Resize panels"
            className={`group relative z-20 mx-1 w-1.5 rounded-full bg-transparent outline-none transition-colors hover:bg-border focus-visible:bg-border ${
              locked ? 'cursor-default' : 'cursor-ew-resize'
            }`}
          />
          <Panel defaultSize={35} minSize={20} order={2}>
            <PanelTile title="Placeholder">
              <div className="p-3 text-xs text-muted-foreground">
                A second tile, so the divider has something to move.
              </div>
            </PanelTile>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}
