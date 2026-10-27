import { renderHook, waitFor, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatGptAuth } from '@/hooks/useChatGptAuth'
import { useModelProvider } from '@/hooks/useModelProvider'
import { initializeServiceHubStore } from '@/hooks/useServiceHub'
import { PlatformFeature } from '@/lib/platform/types'
import type { ChatGptModel, ChatGptStatus } from '@/services/auth/types'

const mocks = vi.hoisted(() => ({
  subscriptionSupported: { current: true },
  auth: {
    chatgptStatus: vi.fn(),
    chatgptLogin: vi.fn(),
    chatgptCancelLogin: vi.fn(),
    chatgptLogout: vi.fn(),
    chatgptModels: vi.fn(),
  },
}))

vi.mock('@/lib/platform/const', () => ({
  PlatformFeatures: new Proxy(
    {},
    {
      get: (_, prop) =>
        prop === PlatformFeature.CHATGPT_SUBSCRIPTION
          ? mocks.subscriptionSupported.current
          : false,
    }
  ) as Record<string, boolean>,
}))

const MOCK_MODELS: ChatGptModel[] = [
  {
    id: 'gpt-4o',
    display_name: 'GPT-4o',
    context_length: 128000,
    vision: true,
    reasoning_efforts: [],
    listed: true,
  },
  {
    id: 'gpt-4o-mini',
    display_name: 'GPT-4o mini',
    context_length: 128000,
    vision: false,
    reasoning_efforts: [],
    listed: true,
  },
  {
    id: 'hidden-model',
    display_name: 'Hidden',
    vision: false,
    reasoning_efforts: [],
    listed: false,
  },
]

describe('useChatGptAuth', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let initialProviderState: any

  beforeEach(() => {
    mocks.subscriptionSupported.current = true

    // Setup ServiceHub
    initializeServiceHubStore({
      auth: () => mocks.auth,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    initialProviderState = {
      providers: [
        {
          provider: 'chatgpt',
          active: true,
          models: [],
          settings: [],
        },
      ],
      selectedProvider: 'chatgpt',
      selectedModel: null,
      deletedModels: [],
      getProviderByName: (name: string) => {
        return useModelProvider.getState().providers.find(p => p.provider === name)
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updateProvider: (name: string, data: any) => {
        useModelProvider.setState(state => ({
          providers: state.providers.map(p =>
            p.provider === name ? { ...p, ...data } : p
          )
        }))
      }
    }
    useModelProvider.setState(initialProviderState)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initialization', () => {
    it('returns unavailable if platform unsupported', async () => {
      mocks.subscriptionSupported.current = false

      let hook: any
      await act(async () => {
        hook = renderHook(() => useChatGptAuth())
      })

      await waitFor(() => {
        expect(hook.result.current.state).toBe('unavailable')
      })

      expect(hook.result.current.state).toBe('unavailable')
      expect(hook.result.current.modelCount).toBe(0)
      expect(hook.result.current.account).toBeUndefined()
    })

    it('returns loading initially and transitions to disconnected if status false', async () => {
      let resolveStatus: (status: ChatGptStatus) => void
      mocks.auth.chatgptStatus.mockReturnValue(
        new Promise((resolve) => {
          resolveStatus = resolve
        })
      )

      let hook: any
      await act(async () => {
        hook = renderHook(() => useChatGptAuth())
      })

      expect(hook.result.current.state).toBe('loading')

      await act(async () => {
        resolveStatus({ connected: false })
      })

      await waitFor(() => {
        expect(hook.result.current.state).not.toBe('loading')
      })

      expect(hook.result.current.state).toBe('disconnected')
      expect(hook.result.current.modelCount).toBe(0)
      expect(hook.result.current.account).toBeUndefined()
    })

    it('transitions to connected and syncs models if status true', async () => {
      mocks.auth.chatgptStatus.mockResolvedValue({
        connected: true,
        email: 'user@example.com',
        plan_type: 'Plus',
      })
      mocks.auth.chatgptModels.mockResolvedValue(MOCK_MODELS)

      let hook: any
      await act(async () => {
        hook = renderHook(() => useChatGptAuth())
      })

      await waitFor(() => {
        expect(hook.result.current.state).not.toBe('loading')
      })

      expect(hook.result.current.state).toBe('connected')
      expect(hook.result.current.modelCount).toBe(2) // listed models only
      expect(hook.result.current.account).toBe('user@example.com (Plus)')

      // Verify store was updated
      const provider = useModelProvider.getState().getProviderByName('chatgpt')
      expect(provider?.models).toHaveLength(2)
      expect(provider?.models?.[0]?.id).toBe('gpt-4o')
      expect(provider?.models?.[0]?.capabilities).toContain('vision')
      expect(provider?.models?.[1]?.id).toBe('gpt-4o-mini')
      expect(provider?.models?.[1]?.capabilities).not.toContain('vision')
    })

    it('handles status read failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mocks.auth.chatgptStatus.mockRejectedValue(new Error('Backend offline'))

      let hook: any
      await act(async () => {
        hook = renderHook(() => useChatGptAuth())
      })

      await waitFor(() => {
        expect(hook.result.current.state).not.toBe('loading')
      })

      expect(hook.result.current.state).toBe('disconnected')
      expect(consoleSpy).toHaveBeenCalledWith(
        '[chatgpt-auth] status read failed:',
        expect.any(Error)
      )
    })
  })

  describe('connect', () => {
    it('handles successful connection', async () => {
      mocks.auth.chatgptStatus.mockResolvedValue({ connected: false })
      mocks.auth.chatgptLogin.mockResolvedValue({
        connected: true,
        email: 'new@example.com',
      })
      mocks.auth.chatgptModels.mockResolvedValue(MOCK_MODELS)

      let hook: any
      await act(async () => {
        hook = renderHook(() => useChatGptAuth())
      })

      await waitFor(() => {
        expect(hook.result.current.state).toBe('disconnected')
      })

      await act(async () => {
        await hook.result.current.connect()
      })

      expect(hook.result.current.state).toBe('connected')
      expect(hook.result.current.account).toBe('new@example.com')
      expect(hook.result.current.modelCount).toBe(2)
      expect(mocks.auth.chatgptLogin).toHaveBeenCalledTimes(1)
    })

    it('surfaces backend errors during connection', async () => {
      mocks.auth.chatgptStatus.mockResolvedValue({ connected: false })
      mocks.auth.chatgptLogin.mockRejectedValue(new Error('Port busy'))

      let hook: any
      await act(async () => {
        hook = renderHook(() => useChatGptAuth())
      })

      await waitFor(() => {
        expect(hook.result.current.state).toBe('disconnected')
      })

      await act(async () => {
        try {
          await hook.result.current.connect()
        } catch (e) {
          // Ignore
        }
      })

      expect(hook.result.current.state).toBe('disconnected')
      expect(hook.result.current.error).toBe('Port busy')
    })

    it('sets state to connecting while waiting for login', async () => {
      mocks.auth.chatgptStatus.mockResolvedValue({ connected: false })
      let resolveLogin: (status: ChatGptStatus) => void
      mocks.auth.chatgptLogin.mockReturnValue(
        new Promise((resolve) => {
          resolveLogin = resolve
        })
      )

      let hook: any
      await act(async () => {
        hook = renderHook(() => useChatGptAuth())
      })

      await waitFor(() => {
        expect(hook.result.current.state).toBe('disconnected')
      })

      let connectPromise: Promise<void> = Promise.resolve()
      await act(async () => {
        connectPromise = hook.result.current.connect()
      })

      expect(hook.result.current.state).toBe('connecting')
      expect(hook.result.current.error).toBeUndefined()

      await act(async () => {
        resolveLogin({ connected: true })
        await connectPromise
      })

      expect(hook.result.current.state).toBe('connected')
    })
  })

  describe('cancel', () => {
    it('calls chatgptCancelLogin', async () => {
      mocks.auth.chatgptStatus.mockResolvedValue({ connected: false })

      let hook: any
      await act(async () => {
        hook = renderHook(() => useChatGptAuth())
      })

      await waitFor(() => {
        expect(hook.result.current.state).toBe('disconnected')
      })

      await act(async () => {
        await hook.result.current.cancel()
      })

      expect(mocks.auth.chatgptCancelLogin).toHaveBeenCalledTimes(1)
    })

    it('handles cancel failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mocks.auth.chatgptStatus.mockResolvedValue({ connected: false })
      mocks.auth.chatgptCancelLogin.mockRejectedValue(new Error('Cancel failed'))

      let hook: any
      await act(async () => {
        hook = renderHook(() => useChatGptAuth())
      })

      await waitFor(() => {
        expect(hook.result.current.state).toBe('disconnected')
      })

      await act(async () => {
        try {
          await hook.result.current.cancel()
        } catch (e) {
          // Ignore
        }
      })

      expect(consoleSpy).toHaveBeenCalledWith(
        '[chatgpt-auth] cancel failed:',
        expect.any(Error)
      )
    })
  })

  describe('disconnect', () => {
    it('handles successful disconnect', async () => {
      mocks.auth.chatgptStatus.mockResolvedValue({
        connected: true,
        email: 'user@example.com',
      })
      mocks.auth.chatgptModels.mockResolvedValue(MOCK_MODELS)
      mocks.auth.chatgptLogout.mockResolvedValue({ connected: false })

      let hook: any
      await act(async () => {
        hook = renderHook(() => useChatGptAuth())
      })

      await waitFor(() => {
        expect(hook.result.current.state).toBe('connected')
      })

      expect(hook.result.current.state).toBe('connected')
      expect(hook.result.current.modelCount).toBe(2)

      await act(async () => {
        await hook.result.current.disconnect()
      })

      expect(hook.result.current.state).toBe('disconnected')
      expect(hook.result.current.modelCount).toBe(0)
      expect(hook.result.current.account).toBeUndefined()

      const provider = useModelProvider.getState().getProviderByName('chatgpt')
      expect(provider?.models).toHaveLength(0)
    })

    it('surfaces backend errors during disconnect', async () => {
      mocks.auth.chatgptStatus.mockResolvedValue({ connected: true })
      mocks.auth.chatgptModels.mockResolvedValue([])
      mocks.auth.chatgptLogout.mockRejectedValue(new Error('Logout failed'))

      let hook: any
      await act(async () => {
        hook = renderHook(() => useChatGptAuth())
      })

      await waitFor(() => {
        expect(hook.result.current.state).toBe('connected')
      })

      await act(async () => {
        try {
          await hook.result.current.disconnect()
        } catch (e) {
          // Ignore
        }
      })

      expect(hook.result.current.error).toBe('Logout failed')
    })
  })

  describe('applyModels behavior', () => {
    it('handles catalogue unreachable when connected', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mocks.auth.chatgptStatus.mockResolvedValue({ connected: true })
      mocks.auth.chatgptModels.mockRejectedValue(new Error('Network error'))

      // Seed provider with a model to verify it gets cleared
      useModelProvider.getState().updateProvider('chatgpt', {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        models: [{ id: 'stale-model' } as any]
      })

      let hook: any
      await act(async () => {
        hook = renderHook(() => useChatGptAuth())
      })

      await waitFor(() => {
        expect(hook.result.current.state).toBe('connected')
      })

      expect(hook.result.current.state).toBe('connected')
      expect(hook.result.current.modelCount).toBe(0)

      const provider = useModelProvider.getState().getProviderByName('chatgpt')
      expect(provider?.models).toHaveLength(0)
      expect(consoleSpy).toHaveBeenCalledWith(
        '[chatgpt-auth] could not list subscription models:',
        expect.any(Error)
      )
    })

    it('avoids updating state if unmounted', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mocks.auth.chatgptStatus.mockResolvedValue({ connected: true })
      let resolveModels: (models: ChatGptModel[]) => void
      mocks.auth.chatgptModels.mockReturnValue(
        new Promise(resolve => {
          resolveModels = resolve
        })
      )

      let hook: any
      await act(async () => {
        hook = renderHook(() => useChatGptAuth())
      })

      await act(async () => {
        hook.unmount()
      })

      await act(async () => {
        resolveModels(MOCK_MODELS)
      })

      // The hook state shouldn't update, but the provider models should still update
      // because syncSubscriptionModels handles it directly outside component state
      const provider = useModelProvider.getState().getProviderByName('chatgpt')
      expect(provider?.models).toHaveLength(2)

      // Ensure no act/React errors occurred due to state updating post unmount
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })
  })
})
