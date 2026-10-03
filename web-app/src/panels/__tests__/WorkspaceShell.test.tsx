import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PanelTile } from '../PanelTile'
import { PanelBoard } from '../PanelBoard'
import { WorkspaceShell } from '../WorkspaceShell'
import { builtinPanels, mergeRegistry } from '../registry'
import { DEFAULT_OPEN, useBoard } from '../useBoard'

const listing = vi.hoisted(() => ({
  value: { installed: [] as unknown[], broken: [] as unknown[] },
}))
const invoked = vi.hoisted(() => ({ calls: [] as { cmd: string; args: unknown }[] }))
const picked = vi.hoisted(() => ({ path: null as string | null }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: unknown) => {
    invoked.calls.push({ cmd, args })
    if (cmd === 'panels_list') return listing.value
    if (cmd === 'panels_install') return { id: 'fresh-panel', name: 'Fresh panel' }
    if (cmd === 'panels_open_folder') return '/tmp/panels'
    return null
  }),
}))

// The eager built-in glob pulls every panel module into this test, and those
// modules reach the app's stores, which import both accessors. The mock has to
// carry both or the import itself fails.
vi.mock('@/hooks/useServiceHub', () => {
  const hub = () => ({
    dialog: () => ({ open: async () => picked.path }),
    mcp: () => ({ getMCPServerStatuses: async () => [] }),
    events: () => ({ listen: async () => () => {} }),
  })
  return { useServiceHub: hub, getServiceHub: hub }
})

// The real PanelGroup measures a DOM jsdom does not have; keep the structure
// and let the tiles render.
vi.mock('react-resizable-panels', () => ({
  PanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PanelResizeHandle: ({ disabled }: { disabled?: boolean }) => (
    <div role="separator" aria-label="Resize panels" data-disabled={String(Boolean(disabled))} />
  ),
}))

vi.mock('@/containers/HeaderPage', () => ({
  default: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}))

beforeEach(() => {
  invoked.calls.length = 0
  listing.value = { installed: [], broken: [] }
  picked.path = null
  // An explicit single panel, not DEFAULT_OPEN: the shell tests count tiles
  // and assert on the Panels overview's own text, and the default board is a
  // product decision that is free to change without rewriting them. The
  // default itself is asserted in `the board store` below.
  useBoard.setState({ open: ['builtin:panels'], locked: false })
})

describe('the registry', () => {
  it('discovers built-in panels instead of being told about them', () => {
    const builtins = builtinPanels()
    // Discovery is the point: the Panels overview ships under builtin/ and
    // appears here without anyone adding it to a list.
    expect(builtins.map((entry) => entry.id)).toContain('builtin:panels')
    expect(builtins.every((entry) => entry.kind === 'builtin')).toBe(true)
  })

  it('merges built-ins and installed panels into one set', () => {
    const merged = mergeRegistry(
      [{ id: 'builtin:a', name: 'A', kind: 'builtin' }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [{ id: 'b', name: 'B' } as any]
    )
    expect(merged.map((entry) => entry.id)).toEqual(['builtin:a', 'panel:b'])
    expect(merged[1].kind).toBe('custom')
  })
})

describe('the board', () => {
  it('shows a broken panel in place, with the reason', async () => {
    listing.value = {
      installed: [],
      broken: [{ id: 'bad-panel', errors: ['missing `name`', 'entry file not found'] }],
    }
    useBoard.setState({ open: ['panel:bad-panel'], locked: false })

    render(<PanelBoard />)

    // The tile stays and says why, rather than the panel vanishing.
    expect(await screen.findByText('missing `name`')).toBeTruthy()
    expect(screen.getByText('entry file not found')).toBeTruthy()
  })

  it('says so when a panel on the board is no longer installed', async () => {
    useBoard.setState({ open: ['panel:removed-panel'], locked: false })
    render(<PanelBoard />)
    expect(await screen.findByText(/no longer installed/i)).toBeTruthy()
  })

  it('locks the resize handles when the board is locked', async () => {
    useBoard.setState({ open: ['builtin:panels', 'panel:x'], locked: true })
    render(<PanelBoard />)
    const handle = await screen.findByRole('separator', { name: 'Resize panels' })
    expect(handle.getAttribute('data-disabled')).toBe('true')
  })
})

describe('the board store', () => {
  it('never opens the same panel twice', () => {
    useBoard.setState({ open: [], locked: false })
    useBoard.getState().addPanel('builtin:panels')
    useBoard.getState().addPanel('builtin:panels')
    expect(useBoard.getState().open).toEqual(['builtin:panels'])
  })

  it('closes one panel and resets back to the default board', () => {
    useBoard.setState({ open: ['builtin:panels', 'panel:x'], locked: true })
    useBoard.getState().closePanel('panel:x')
    expect(useBoard.getState().open).toEqual(['builtin:panels'])

    useBoard.getState().reset()
    expect(useBoard.getState().open).toEqual(DEFAULT_OPEN)
    expect(useBoard.getState().locked).toBe(false)
  })

  it('opens a default board that says something on a fresh install', () => {
    // Phase 5's done-when. A single panel whose only content is "no custom
    // panels installed" is not a useful first screen, so the default has to
    // be panels that read Radium's own data, and they have to exist.
    const known = new Set(builtinPanels().map((entry) => entry.id))
    expect(DEFAULT_OPEN.length).toBeGreaterThan(1)
    for (const id of DEFAULT_OPEN) {
      expect(known.has(id)).toBe(true)
    }
  })
})

describe('WorkspaceShell', () => {
  it('counts the open panels and pluralises it', async () => {
    render(<WorkspaceShell />)
    expect(await screen.findByText('1 panel')).toBeTruthy()

    useBoard.getState().addPanel('panel:another')
    expect(await screen.findByText('2 panels')).toBeTruthy()
  })

  it('toggles the lock, and the control offers the inverse action', () => {
    render(<WorkspaceShell />)
    fireEvent.click(screen.getByRole('button', { name: 'Lock layout' }))
    expect(useBoard.getState().locked).toBe(true)
    expect(screen.getByRole('button', { name: 'Unlock layout' })).toBeTruthy()
  })

  it('installs the folder the user picked and puts it on the board', async () => {
    picked.path = '/somewhere/fresh-panel'
    render(<WorkspaceShell />)

    fireEvent.click(screen.getByRole('button', { name: /install/i }))

    await waitFor(() => expect(screen.getByText('Installed Fresh panel')).toBeTruthy())
    // The new panel joins the board, so the user sees it without hunting.
    expect(useBoard.getState().open).toContain('panel:fresh-panel')
  })

  it('leaves the board alone when the picker is dismissed', async () => {
    picked.path = null
    render(<WorkspaceShell />)
    const before = [...useBoard.getState().open]

    fireEvent.click(screen.getByRole('button', { name: /install/i }))

    await waitFor(() => expect(useBoard.getState().open).toEqual(before))
    // Matched tightly: the Panels overview legitimately renders the words
    // "No custom panels installed", so a loose /installed/i would pass here
    // for the wrong reason.
    expect(screen.queryByText(/^Installed /)).toBeNull()
  })

  it('surfaces an install failure instead of swallowing it', async () => {
    picked.path = '/somewhere/broken'
    const core = await import('@tauri-apps/api/core')
    vi.mocked(core.invoke).mockImplementationOnce(async () => {
      throw new Error('Invalid panel.json — missing `name`')
    })
    render(<WorkspaceShell />)

    fireEvent.click(screen.getByRole('button', { name: /install/i }))

    expect(await screen.findByText(/missing `name`/)).toBeTruthy()
  })

  it('does not put a Tauri drag region on the board', () => {
    // The window's drag region belongs to WindowFrame (and, on macOS, to
    // HeaderPage). A second one around the board would make dragging a panel
    // move the whole OS window.
    const { container } = render(<WorkspaceShell />)
    expect(container.querySelector('[data-tauri-drag-region]')).toBeNull()
  })
})

describe('PanelTile', () => {
  // Stands in for a Tauri drag region: an ancestor that would move the OS
  // window if a mousedown reached it. Asserting on what it renders, rather
  // than on a spy, keeps the test about the behaviour that matters.
  function DragRegionProbe({ children }: { children: ReactNode }) {
    const [moved, setMoved] = useState(false)
    return (
      <div onMouseDown={() => setMoved(true)}>
        {children}
        <span data-testid="window">{moved ? 'window moved' : 'window still'}</span>
      </div>
    )
  }

  it('stops mousedown on its header from reaching an ancestor drag region', () => {
    render(
      <DragRegionProbe>
        <PanelTile title="Logs">
          <span>body</span>
        </PanelTile>
      </DragRegionProbe>
    )

    const header = document.querySelector('[data-panel-header]')
    expect(header).not.toBeNull()
    fireEvent.mouseDown(header as Element)

    expect(screen.getByTestId('window').textContent).toBe('window still')
  })

  it('lets mousedown through from its body, which the panel owns', () => {
    render(
      <DragRegionProbe>
        <PanelTile title="Logs">
          <span>body</span>
        </PanelTile>
      </DragRegionProbe>
    )

    fireEvent.mouseDown(screen.getByText('body'))

    expect(screen.getByTestId('window').textContent).toBe('window moved')
  })

  it('offers a close control only when it can close', () => {
    const { rerender } = render(
      <PanelTile title="Logs">
        <span>body</span>
      </PanelTile>
    )
    expect(screen.queryByRole('button', { name: 'Close Logs' })).toBeNull()

    const onClose = vi.fn()
    rerender(
      <PanelTile title="Logs" onClose={onClose}>
        <span>body</span>
      </PanelTile>
    )
    const button = screen.getByRole('button', { name: 'Close Logs' })
    fireEvent.click(button)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(button.getAttribute('aria-label')).toBe('Close Logs')
  })
})
