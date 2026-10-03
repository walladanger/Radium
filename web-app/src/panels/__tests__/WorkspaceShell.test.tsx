import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceShell } from '../WorkspaceShell'
import { PanelTile } from '../PanelTile'

const resizeHandles = vi.hoisted(() => ({ disabled: [] as boolean[] }))

// The real PanelGroup measures a DOM it does not have in jsdom. These stubs
// keep the structure (group, panels, handle) and record what the shell passes
// to the handle, which is the only prop the lock is allowed to change.
vi.mock('react-resizable-panels', () => ({
  PanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PanelResizeHandle: ({
    disabled,
    ...rest
  }: {
    disabled?: boolean
    'aria-label'?: string
  }) => {
    resizeHandles.disabled.push(Boolean(disabled))
    return <div role="separator" aria-label={rest['aria-label']} />
  },
}))

// HeaderPage reaches for the sidebar store and the platform globals; the
// shell only cares that its title row renders, so stub it to its children.
vi.mock('@/containers/HeaderPage', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <header>{children}</header>
  ),
}))

describe('WorkspaceShell', () => {
  it('renders a board with its placeholder tiles', () => {
    render(<WorkspaceShell />)

    expect(screen.getByText('Workspace')).toBeTruthy()
    expect(screen.getByText('Panels')).toBeTruthy()
    expect(screen.getByText('Placeholder')).toBeTruthy()
    expect(screen.getByRole('separator', { name: 'Resize panels' })).toBeTruthy()
  })

  it('starts unlocked and locks the resize handle when toggled', () => {
    resizeHandles.disabled.length = 0
    render(<WorkspaceShell />)

    expect(resizeHandles.disabled.at(-1)).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Lock layout' }))

    expect(resizeHandles.disabled.at(-1)).toBe(true)
    // The control flips to the inverse action, so the lock can be undone.
    expect(screen.getByRole('button', { name: 'Unlock layout' })).toBeTruthy()
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
  it('stops mousedown on its header from reaching an ancestor drag region', () => {
    const onMouseDown = vi.fn()
    render(
      <div onMouseDown={onMouseDown}>
        <PanelTile title="Logs">
          <span>body</span>
        </PanelTile>
      </div>
    )

    const header = document.querySelector('[data-panel-header]')
    expect(header).not.toBeNull()
    fireEvent.mouseDown(header as Element)

    expect(onMouseDown).not.toHaveBeenCalled()
  })

  it('lets mousedown through from its body, which the panel owns', () => {
    const onMouseDown = vi.fn()
    render(
      <div onMouseDown={onMouseDown}>
        <PanelTile title="Logs">
          <span>body</span>
        </PanelTile>
      </div>
    )

    fireEvent.mouseDown(screen.getByText('body'))

    expect(onMouseDown).toHaveBeenCalledTimes(1)
  })
})
