import { describe, it, expect, vi } from 'vitest'
import { addExternalAgentFolder } from '../agent-workspace-actions'
import type { ServiceHub } from '@/services'

const mockAgentRoots = vi.hoisted(() => {
  const roots: Record<string, any> = {}
  return {
    addExternalRoot: (key: string, root: any) => {
      roots[key] = root
    },
    getRoots: () => roots,
  }
})

vi.mock('@/hooks/useAgentMode', () => ({
  useAgentMode: {
    getState: () => ({
      addExternalRoot: mockAgentRoots.addExternalRoot,
    }),
  },
}))

vi.mock('@/services/agent/tauri', () => ({
  resolveAgentWorkspaceRoot: async (path: string) => ({
    name: 'test-folder',
    path,
  }),
}))

describe('addExternalAgentFolder', () => {
  it('returns false when dialog selection is not a string', async () => {
    const serviceHub = {
      dialog: () => ({
        open: async () => null,
      }),
    } as unknown as ServiceHub

    const result = await addExternalAgentFolder(serviceHub, 'workspace-1')
    expect(result).toBe(false)
  })

  it('adds external root and returns true when a directory is selected', async () => {
    const serviceHub = {
      dialog: () => ({
        open: async () => '/path/to/selected/folder',
      }),
    } as unknown as ServiceHub

    const result = await addExternalAgentFolder(serviceHub, 'workspace-2')
    expect(result).toBe(true)

    expect(mockAgentRoots.getRoots()['workspace-2']).toEqual({
      name: 'test-folder',
      path: '/path/to/selected/folder',
      canEdit: true,
    })
  })
})
