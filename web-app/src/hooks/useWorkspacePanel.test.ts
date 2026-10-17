import { afterEach, expect, it } from 'vitest'
import { useWorkspacePanel } from './useWorkspacePanel'
afterEach(() => { useWorkspacePanel.getState().close(); useWorkspacePanel.getState().setProductionView('steps') })
it('opens and switches adjacent views without replacing a route or maintaining task truth', () => {
  expect(useWorkspacePanel.getState().panel).toBeNull()
  useWorkspacePanel.getState().toggle('agents')
  expect(useWorkspacePanel.getState().panel).toBe('agents')
  useWorkspacePanel.getState().toggle('production')
  expect(useWorkspacePanel.getState().panel).toBe('production')
  useWorkspacePanel.getState().toggle('production')
  expect(useWorkspacePanel.getState().panel).toBeNull()
})

it('opens annotations directly without toggling an already open production panel closed', () => {
  useWorkspacePanel.getState().toggle('production')
  useWorkspacePanel.getState().openAnnotations()
  expect(useWorkspacePanel.getState().panel).toBe('production')
  expect(useWorkspacePanel.getState().productionView).toBe('annotations')
})
