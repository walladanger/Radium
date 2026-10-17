import { create } from 'zustand'
export type WorkspacePanel = 'agents' | 'production'
export const useWorkspacePanel = create<{ panel: WorkspacePanel | null; toggle: (panel: WorkspacePanel) => void; close: () => void }>(set => ({
  panel: null,
  toggle: panel => set(state => ({ panel: state.panel === panel ? null : panel })),
  close: () => set({ panel: null }),
}))
