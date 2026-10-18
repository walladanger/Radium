import { create } from 'zustand'
export type WorkspacePanel = 'agents' | 'production'
export type ProductionView = 'steps' | 'topology' | 'branches' | 'annotations'
export const useWorkspacePanel = create<{ panel: WorkspacePanel | null; productionView: ProductionView; setProductionView: (view: ProductionView) => void; openAnnotations: () => void; toggle: (panel: WorkspacePanel) => void; close: () => void }>(set => ({
  panel: null,
  productionView: 'steps',
  setProductionView: productionView => set({ productionView }),
  openAnnotations: () => set({ panel: 'production', productionView: 'annotations' }),
  toggle: panel => set(state => panel === 'production' && state.productionView === 'annotations'
    ? { panel: 'production', productionView: 'steps' }
    : { panel: state.panel === panel ? null : panel }),
  close: () => set({ panel: null }),
}))
