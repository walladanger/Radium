import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { localStorageKey } from '@/constants/localStorage'
import {
  createPanelInstance, normalizeRect, restoreWorkspace,
  type BoardMode, type Rect, type Viewport, type WorkspaceDocument,
} from './workspaceDocument'
export { DEFAULT_OPEN } from './workspaceDocument'

export type BoardState = WorkspaceDocument & {
  addPanel: (definitionId: string) => void
  closePanel: (id: string) => void
  setLocked: (locked: boolean) => void
  setMode: (mode: BoardMode) => void
  setSnap: (snap: boolean) => void
  setViewport: (viewport: Viewport) => void
  setRect: (id: string, rect: Rect) => void
  focusPanel: (id: string) => void
  toggleMinimized: (id: string) => void
  toggleMaximized: (id: string) => void
  reset: () => void
}

/** One presentation owns this store. Geometry commits on gesture completion, never each pointer tick. */
export const useBoard = create<BoardState>()(
  persist(
    (set) => ({
      ...restoreWorkspace(undefined),
      addPanel: (definitionId) => set((state) => {
        if (state.open.some((id) => (state.panels[id]?.definitionId ?? id) === definitionId)) return state
        const panel = createPanelInstance(definitionId, definitionId, state.open.length)
        return { open: [...state.open, panel.id], panels: { ...state.panels, [panel.id]: panel } }
      }),
      closePanel: (id) => set((state) => {
        const panels = { ...state.panels }
        delete panels[id]
        return { open: state.open.filter((entry) => entry !== id), panels }
      }),
      setLocked: (locked) => set({ locked }),
      setMode: (mode) => set({ mode }),
      setSnap: (snap) => set({ snap }),
      setViewport: (viewport) => set((state) => state.locked ? state : {
        viewport: restoreWorkspace({ open: [], viewport }).viewport,
      }),
      setRect: (id, rect) => set((state) => {
        if (state.locked || !state.open.includes(id) || state.mode === 'split') return state
        const panel = state.panels[id] ?? createPanelInstance(id, id, state.open.indexOf(id))
        return { panels: { ...state.panels, [id]: {
          ...panel, [state.mode]: normalizeRect(rect, panel[state.mode], state.mode === 'canvas'),
        } } }
      }),
      focusPanel: (id) => set((state) => state.open.includes(id) && state.open.at(-1) !== id
        ? { open: [...state.open.filter((entry) => entry !== id), id] } : state),
      toggleMinimized: (id) => set((state) => {
        const panel = state.panels[id]
        return state.locked || !panel ? state : { panels: { ...state.panels,
          [id]: { ...panel, minimized: !panel.minimized },
        } }
      }),
      toggleMaximized: (id) => set((state) => {
        const panel = state.panels[id]
        return state.locked || !panel ? state : { panels: { ...state.panels,
          [id]: { ...panel, maximized: !panel.maximized, minimized: false },
        } }
      }),
      reset: () => set(restoreWorkspace(undefined)),
    }),
    {
      name: localStorageKey.panelBoard,
      version: 1,
      skipHydration: true,
      migrate: (saved, version) => {
        if (version > 1) throw new Error('A newer Radium version owns this workspace.')
        const backup = localStorage.getItem(localStorageKey.panelBoard)
        if (backup && !localStorage.getItem(localStorageKey.panelBoard + '-v0-backup')) {
          localStorage.setItem(localStorageKey.panelBoard + '-v0-backup', backup)
        }
        return restoreWorkspace(saved)
      },
      merge: (saved, current) => ({ ...current, ...restoreWorkspace(saved) }),
      partialize: ({ schemaVersion, open, panels, mode, locked, snap, viewport }) =>
        ({ schemaVersion, open, panels, mode, locked, snap, viewport }),
    }
  )
)
