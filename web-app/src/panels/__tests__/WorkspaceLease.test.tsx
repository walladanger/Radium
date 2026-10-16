import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { WorkspaceLease } from '../WorkspaceLease'
import { useBoard } from '../useBoard'

let occupied = false
beforeEach(() => {
  occupied = false
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: async (_name: string, _options: unknown, callback: (lock: object | null) => Promise<void>) => {
      if (occupied) return callback(null)
      occupied = true
      try { await callback({ name: 'workspace' }) } finally { occupied = false }
    },
  } })
})
describe('workspace presentation ownership', () => {
  it('preserves an unknown future persistence envelope without rendering an editor', async () => {
    const key = useBoard.persist.getOptions().name
    const bytes = JSON.stringify({ version: 99, state: { open: ['builtin:models'] } })
    localStorage.setItem(key, bytes)
    render(<WorkspaceLease><p>Unsafe future editor</p></WorkspaceLease>)
    expect(await screen.findByText(/saved workspace could not be read/i)).toBeVisible()
    expect(screen.queryByText('Unsafe future editor')).toBeNull()
    expect(localStorage.getItem(key)).toBe(bytes)
    localStorage.removeItem(key)
  })
  it('allows one board, releases on unmount, and permits retry', async () => {
    const first = render(<WorkspaceLease><p>First board</p></WorkspaceLease>)
    expect(await screen.findByText('First board')).toBeVisible()
    render(<WorkspaceLease><p>Second board</p></WorkspaceLease>)
    expect(await screen.findByText(/already open in another window/i)).toBeVisible()
    expect(screen.queryByText('Second board')).toBeNull()
    first.unmount()
    await waitFor(() => expect(occupied).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Second board')).toBeVisible()
  })
  it('explains unavailable locking instead of allowing competing editors', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
    render(<WorkspaceLease><p>Unsafe board</p></WorkspaceLease>)
    expect(await screen.findByText(/requires web locks/i)).toBeVisible()
    expect(screen.queryByText('Unsafe board')).toBeNull()
  })
})
