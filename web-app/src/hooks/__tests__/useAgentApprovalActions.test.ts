import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAgentApprovalActions } from '../useAgentApprovalActions'
import type { AgentApprovalDecision, AgentFolderAccessDecision } from '@/types/agent'

const mocks = vi.hoisted(() => ({
  toasts: [] as string[],
  resolvedApprovals: [] as AgentApprovalDecision[],
  resolvedFolderAccesses: [] as AgentFolderAccessDecision[],
  clearedApprovals: [] as { threadId: string; id: string }[],
  clearedFolderAccesses: [] as { threadId: string; id: string }[],
  addedExternalRoots: [] as { threadId: string; root: any }[],
  setApprovalResolving: [] as { threadId: string; value: boolean }[],
  setFolderAccessResolving: [] as { threadId: string; value: boolean }[],
  runState: undefined as any,
  throwApproval: undefined as Error | undefined,
  throwFolderAccess: undefined as Error | undefined,
}))

vi.mock('sonner', () => ({
  toast: {
    error: (msg: string) => {
      mocks.toasts.push(msg)
    },
  },
}))

vi.mock('@/i18n/react-i18next-compat', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('@/hooks/useAgentMode', () => ({
  useAgentMode: {
    getState: () => ({
      addExternalRoot: (threadId: string, root: any) => {
        mocks.addedExternalRoots.push({ threadId, root })
      },
    }),
  },
}))

vi.mock('@/hooks/useAgentRun', () => {
  const useAgentRun = (selector: any) =>
    selector({ runs: { thread1: mocks.runState } })
  useAgentRun.getState = () => ({
    setApprovalResolving: (threadId: string, value: boolean) => {
      mocks.setApprovalResolving.push({ threadId, value })
    },
    setFolderAccessResolving: (threadId: string, value: boolean) => {
      mocks.setFolderAccessResolving.push({ threadId, value })
    },
    clearPendingApproval: (threadId: string, id: string) => {
      mocks.clearedApprovals.push({ threadId, id })
    },
    clearPendingFolderAccess: (threadId: string, id: string) => {
      mocks.clearedFolderAccesses.push({ threadId, id })
    },
  })
  return { useAgentRun }
})

vi.mock('@/services/agent/tauri', () => ({
  isStaleAgentApprovalError: (error: any) => error?.message === 'stale approval',
  isStaleAgentFolderAccessError: (error: any) => error?.message === 'stale folder',
  resolveAgentApproval: async (req: AgentApprovalDecision) => {
    mocks.resolvedApprovals.push(req)
    if (mocks.throwApproval) {
      throw mocks.throwApproval
    }
  },
  resolveAgentFolderAccess: async (req: AgentFolderAccessDecision) => {
    mocks.resolvedFolderAccesses.push(req)
    if (mocks.throwFolderAccess) {
      throw mocks.throwFolderAccess
    }
  },
  resolveAgentWorkspaceRoot: async (path: string) => {
    return { rootId: `root_${path}`, path, name: `name_${path}` }
  },
}))

describe('useAgentApprovalActions', () => {
  beforeEach(() => {
    mocks.toasts = []
    mocks.resolvedApprovals = []
    mocks.resolvedFolderAccesses = []
    mocks.clearedApprovals = []
    mocks.clearedFolderAccesses = []
    mocks.addedExternalRoots = []
    mocks.setApprovalResolving = []
    mocks.setFolderAccessResolving = []
    mocks.runState = undefined
    mocks.throwApproval = undefined
    mocks.throwFolderAccess = undefined
  })

  describe('resolveApproval', () => {
    it('does nothing if threadId is missing', async () => {
      const { result } = renderHook(() => useAgentApprovalActions(undefined))
      await act(async () => {
        await result.current.resolveApproval('allow_once')
      })
      expect(mocks.resolvedApprovals).toStrictEqual([])
    })

    it('does nothing if there is no pending approval', async () => {
      mocks.runState = { pendingApproval: undefined }
      const { result } = renderHook(() => useAgentApprovalActions('thread1'))
      await act(async () => {
        await result.current.resolveApproval('allow_once')
      })
      expect(mocks.resolvedApprovals).toStrictEqual([])
    })

    it('allows once', async () => {
      mocks.runState = { pendingApproval: { approval_id: 'app1' } }
      const { result } = renderHook(() => useAgentApprovalActions('thread1'))
      await act(async () => {
        await result.current.resolveApproval('allow_once')
      })
      expect(mocks.resolvedApprovals).toStrictEqual([
        { approval_id: 'app1', decision: 'allow_once' },
      ])
      expect(mocks.setApprovalResolving).toStrictEqual([{ threadId: 'thread1', value: true }])
      expect(mocks.clearedApprovals).toStrictEqual([{ threadId: 'thread1', id: 'app1' }])
    })

    it('denies', async () => {
      mocks.runState = { pendingApproval: { approval_id: 'app2' } }
      const { result } = renderHook(() => useAgentApprovalActions('thread1'))
      await act(async () => {
        await result.current.resolveApproval('deny')
      })
      expect(mocks.resolvedApprovals).toStrictEqual([
        { approval_id: 'app2', decision: 'deny' },
      ])
    })

    it('always allows', async () => {
      mocks.runState = { pendingApproval: { approval_id: 'app3' } }
      const { result } = renderHook(() => useAgentApprovalActions('thread1'))
      await act(async () => {
        await result.current.resolveApproval('always_allow')
      })
      expect(mocks.resolvedApprovals).toStrictEqual([
        { approval_id: 'app3', decision: 'always_allow' },
      ])
    })

    it('prevents concurrent calls', async () => {
      mocks.runState = { pendingApproval: { approval_id: 'app4' } }
      const { result } = renderHook(() => useAgentApprovalActions('thread1'))

      // Simulate resolving without awaiting so the second call happens concurrently
      let promise1: Promise<void>
      let promise2: Promise<void>
      act(() => {
        promise1 = result.current.resolveApproval('allow_once')
        promise2 = result.current.resolveApproval('allow_once')
      })
      await act(async () => {
        await promise1
        await promise2
      })

      expect(mocks.resolvedApprovals).toStrictEqual([
        { approval_id: 'app4', decision: 'allow_once' },
      ])
    })

    it('prevents calls if already resolving globally', async () => {
      mocks.runState = { pendingApproval: { approval_id: 'app5' }, approvalResolving: true }
      const { result } = renderHook(() => useAgentApprovalActions('thread1'))
      await act(async () => {
        await result.current.resolveApproval('allow_once')
      })
      expect(mocks.resolvedApprovals).toStrictEqual([])
    })

    it('handles standard error', async () => {
      mocks.runState = { pendingApproval: { approval_id: 'app6' } }
      mocks.throwApproval = new Error('some error')
      const { result } = renderHook(() => useAgentApprovalActions('thread1'))
      await act(async () => {
        await result.current.resolveApproval('allow_once')
      })
      expect(mocks.toasts).toStrictEqual(['agentApproval.resolveFailed'])
      expect(mocks.setApprovalResolving).toStrictEqual([
        { threadId: 'thread1', value: true },
        { threadId: 'thread1', value: false },
      ])

      // Can call again after error
      mocks.throwApproval = undefined
      await act(async () => {
        await result.current.resolveApproval('allow_once')
      })
      expect(mocks.resolvedApprovals.length).toBe(2)
    })

    it('handles stale error', async () => {
      mocks.runState = { pendingApproval: { approval_id: 'app7' } }
      mocks.throwApproval = new Error('stale approval')
      const { result } = renderHook(() => useAgentApprovalActions('thread1'))
      await act(async () => {
        await result.current.resolveApproval('allow_once')
      })
      expect(mocks.toasts).toStrictEqual([])
      expect(mocks.clearedApprovals).toStrictEqual([
        { threadId: 'thread1', id: 'app7' },
      ])
    })
  })

  describe('resolveFolderAccess', () => {
    it('does nothing if threadId is missing', async () => {
      const { result } = renderHook(() => useAgentApprovalActions(undefined))
      await act(async () => {
        await result.current.resolveFolderAccess(true)
      })
      expect(mocks.resolvedFolderAccesses).toStrictEqual([])
    })

    it('does nothing if there is no pending folder access', async () => {
      mocks.runState = { pendingFolderAccess: undefined }
      const { result } = renderHook(() => useAgentApprovalActions('thread1'))
      await act(async () => {
        await result.current.resolveFolderAccess(true)
      })
      expect(mocks.resolvedFolderAccesses).toStrictEqual([])
    })

    it('allows folder access', async () => {
      mocks.runState = {
        pendingFolderAccess: {
          run_id: 'run1',
          access_id: 'acc1',
          path: '/test/path',
        },
      }
      const { result } = renderHook(() => useAgentApprovalActions('thread1'))
      await act(async () => {
        await result.current.resolveFolderAccess(true)
      })
      expect(mocks.addedExternalRoots).toStrictEqual([
        {
          threadId: 'thread1',
          root: {
            rootId: 'root_/test/path',
            path: '/test/path',
            name: 'name_/test/path',
            canEdit: true,
          },
        },
      ])
      expect(mocks.resolvedFolderAccesses).toStrictEqual([
        { run_id: 'run1', access_id: 'acc1', allow: true },
      ])
      expect(mocks.setFolderAccessResolving).toStrictEqual([
        { threadId: 'thread1', value: true },
      ])
      expect(mocks.clearedFolderAccesses).toStrictEqual([
        { threadId: 'thread1', id: 'acc1' },
      ])
    })

    it('denies folder access', async () => {
      mocks.runState = {
        pendingFolderAccess: {
          run_id: 'run2',
          access_id: 'acc2',
          path: '/test/path2',
        },
      }
      const { result } = renderHook(() => useAgentApprovalActions('thread1'))
      await act(async () => {
        await result.current.resolveFolderAccess(false)
      })
      expect(mocks.addedExternalRoots).toStrictEqual([])
      expect(mocks.resolvedFolderAccesses).toStrictEqual([
        { run_id: 'run2', access_id: 'acc2', allow: false },
      ])
      expect(mocks.clearedFolderAccesses).toStrictEqual([
        { threadId: 'thread1', id: 'acc2' },
      ])
    })

    it('prevents concurrent calls', async () => {
      mocks.runState = {
        pendingFolderAccess: {
          run_id: 'run3',
          access_id: 'acc3',
          path: '/test/path3',
        },
      }
      const { result } = renderHook(() => useAgentApprovalActions('thread1'))

      let promise1: Promise<void>
      let promise2: Promise<void>
      act(() => {
        promise1 = result.current.resolveFolderAccess(true)
        promise2 = result.current.resolveFolderAccess(true)
      })
      await act(async () => {
        await promise1
        await promise2
      })

      expect(mocks.resolvedFolderAccesses).toStrictEqual([
        { run_id: 'run3', access_id: 'acc3', allow: true },
      ])
    })

    it('prevents calls if already resolving globally', async () => {
      mocks.runState = {
        pendingFolderAccess: {
          run_id: 'run4',
          access_id: 'acc4',
          path: '/test/path4',
        },
        folderAccessResolving: true,
      }
      const { result } = renderHook(() => useAgentApprovalActions('thread1'))
      await act(async () => {
        await result.current.resolveFolderAccess(true)
      })
      expect(mocks.resolvedFolderAccesses).toStrictEqual([])
    })

    it('handles standard error', async () => {
      mocks.runState = {
        pendingFolderAccess: {
          run_id: 'run5',
          access_id: 'acc5',
          path: '/test/path5',
        },
      }
      mocks.throwFolderAccess = new Error('some error')
      const { result } = renderHook(() => useAgentApprovalActions('thread1'))
      await act(async () => {
        await result.current.resolveFolderAccess(true)
      })
      expect(mocks.toasts).toStrictEqual(['agentFolderAccess.resolveFailed'])
      expect(mocks.setFolderAccessResolving).toStrictEqual([
        { threadId: 'thread1', value: true },
        { threadId: 'thread1', value: false },
      ])

      // Can call again after error
      mocks.throwFolderAccess = undefined
      await act(async () => {
        await result.current.resolveFolderAccess(true)
      })
      expect(mocks.resolvedFolderAccesses.length).toBe(2)
    })

    it('handles stale error', async () => {
      mocks.runState = {
        pendingFolderAccess: {
          run_id: 'run6',
          access_id: 'acc6',
          path: '/test/path6',
        },
      }
      mocks.throwFolderAccess = new Error('stale folder')
      const { result } = renderHook(() => useAgentApprovalActions('thread1'))
      await act(async () => {
        await result.current.resolveFolderAccess(true)
      })
      expect(mocks.toasts).toStrictEqual([])
      expect(mocks.clearedFolderAccesses).toStrictEqual([
        { threadId: 'thread1', id: 'acc6' },
      ])
    })
  })
})
