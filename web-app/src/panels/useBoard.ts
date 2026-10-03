import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { localStorageKey } from '@/constants/localStorage'

/**
 * Which panels are on the board, and whether it is locked.
 *
 * Persisted to localStorage through zustand, which is how this app already
 * keeps per-device UI state — the resizable pane sizes beside it go to
 * localStorage too, via `useDefaultLayout`. The panel plan originally said to
 * put this in the app's settings store instead; that was carried over from
 * ClaudeDesktopClient, whose board lived in app settings. Following the
 * convention already in this repo beats following that note.
 */
export type BoardState = {
  open: string[]
  locked: boolean
  addPanel: (id: string) => void
  closePanel: (id: string) => void
  setLocked: (locked: boolean) => void
  reset: () => void
}

/**
 * What a fresh board shows. Deliberately a real panel rather than nothing: an
 * empty board gives a new user no idea what this screen is for.
 */
export const DEFAULT_OPEN = ['builtin:panels']

export const useBoard = create<BoardState>()(
  persist(
    (set) => ({
      open: DEFAULT_OPEN,
      locked: false,
      addPanel: (id) =>
        set((state) =>
          // Adding a panel that is already open would give two tiles with the
          // same id, which the board keys on.
          state.open.includes(id) ? state : { open: [...state.open, id] }
        ),
      closePanel: (id) => set((state) => ({ open: state.open.filter((open) => open !== id) })),
      setLocked: (locked) => set({ locked }),
      reset: () => set({ open: [...DEFAULT_OPEN], locked: false }),
    }),
    { name: localStorageKey.panelBoard }
  )
)
