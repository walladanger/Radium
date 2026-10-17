import { afterEach, expect, it } from 'vitest'
import { useWorkspacePanel } from './useWorkspacePanel'
afterEach(() => useWorkspacePanel.getState().close())
it('opens and switches adjacent views without replacing a route or maintaining task truth', () => {
  expect(useWorkspacePanel.getState().panel).toBeNull()
  useWorkspacePanel.getState().toggle('agents')
  expect(useWorkspacePanel.getState().panel).toBe('agents')
  useWorkspacePanel.getState().toggle('production')
  expect(useWorkspacePanel.getState().panel).toBe('production')
  useWorkspacePanel.getState().toggle('production')
  expect(useWorkspacePanel.getState().panel).toBeNull()
})
