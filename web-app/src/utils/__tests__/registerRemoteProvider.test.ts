import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isLocalProvider,
  isSelfHostedProviderName,
  isLoopbackUrl,
  isKeylessRemoteProvider,
  isSubscriptionProvider,
  registerRemoteProvider,
  unregisterRemoteProvider,
} from '../registerRemoteProvider'

const invokeMock = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

const isPlatformTauriMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/platform/utils', () => ({
  isPlatformTauri: isPlatformTauriMock,
}))

describe('registerRemoteProvider helpers', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    isPlatformTauriMock.mockReset()
  })

  describe('isLocalProvider', () => {
    it('returns true for all LOCAL_PROVIDER_NAMES', () => {
      expect(isLocalProvider('llamacpp')).toBe(true)
      expect(isLocalProvider('llamacpp-upstream')).toBe(true)
      expect(isLocalProvider('mlx')).toBe(true)
      expect(isLocalProvider('foundation-models')).toBe(true)
    })

    it('returns false for unknown providers and empty values', () => {
      expect(isLocalProvider('openai')).toBe(false)
      expect(isLocalProvider('')).toBe(false)
      expect(isLocalProvider(null)).toBe(false)
      expect(isLocalProvider(undefined)).toBe(false)
    })
  })

  describe('isSelfHostedProviderName', () => {
    it('returns true for self-hosted providers', () => {
      expect(isSelfHostedProviderName('ollama')).toBe(true)
      expect(isSelfHostedProviderName('llamacpp-server')).toBe(true)
    })

    it('returns false for others', () => {
      expect(isSelfHostedProviderName('openai')).toBe(false)
      expect(isSelfHostedProviderName(null)).toBe(false)
      expect(isSelfHostedProviderName(undefined)).toBe(false)
    })
  })

  describe('isLoopbackUrl', () => {
    it('returns true for loopback URLs', () => {
      expect(isLoopbackUrl('http://localhost:11434')).toBe(true)
      expect(isLoopbackUrl('http://127.0.0.1:8080/v1')).toBe(true)
      expect(isLoopbackUrl('http://0.0.0.0:1234')).toBe(true)
      expect(isLoopbackUrl('http://[::1]:8080')).toBe(true)
      expect(isLoopbackUrl('http://LOCALHOST:8080')).toBe(true)
    })

    it('returns false for LAN IP, public host, malformed string, empty, null', () => {
      expect(isLoopbackUrl('http://192.168.1.100:8080')).toBe(false)
      expect(isLoopbackUrl('http://[::2]:8080')).toBe(false)
      expect(isLoopbackUrl('https://api.openai.com/v1')).toBe(false)
      expect(isLoopbackUrl('not-a-url')).toBe(false)
      expect(isLoopbackUrl('')).toBe(false)
      expect(isLoopbackUrl(null)).toBe(false)
      expect(isLoopbackUrl(undefined)).toBe(false)
    })
  })

  describe('isKeylessRemoteProvider', () => {
    it('returns false for local provider', () => {
      expect(isKeylessRemoteProvider({ provider: 'llamacpp', base_url: 'http://localhost:11434' })).toBe(false)
      expect(isKeylessRemoteProvider({ provider: 'mlx' })).toBe(false)
    })

    it('returns true for self-hosted name on any URL', () => {
      expect(isKeylessRemoteProvider({ provider: 'ollama', base_url: 'http://192.168.1.100:11434' })).toBe(true)
      expect(isKeylessRemoteProvider({ provider: 'llamacpp-server' })).toBe(true)
    })

    it('returns true for other provider only on loopback URL', () => {
      expect(isKeylessRemoteProvider({ provider: 'lm-studio', base_url: 'http://localhost:1234/v1' })).toBe(true)
      expect(isKeylessRemoteProvider({ provider: 'lm-studio', base_url: 'http://[::1]:1234/v1' })).toBe(true)
      expect(isKeylessRemoteProvider({ provider: 'lm-studio', base_url: 'http://192.168.1.100:1234/v1' })).toBe(false)
    })

    it('returns false for null/undefined', () => {
      expect(isKeylessRemoteProvider(null)).toBe(false)
      expect(isKeylessRemoteProvider(undefined)).toBe(false)
    })
  })

  describe('isSubscriptionProvider', () => {
    it('returns true for chatgpt', () => {
      expect(isSubscriptionProvider('chatgpt')).toBe(true)
    })

    it('returns false for others', () => {
      expect(isSubscriptionProvider('openai')).toBe(false)
      expect(isSubscriptionProvider(null)).toBe(false)
      expect(isSubscriptionProvider(undefined)).toBe(false)
    })
  })

  describe('registerRemoteProvider', () => {
    it('skips registration for local provider and returns false', async () => {
      const result = await registerRemoteProvider({ provider: 'llamacpp', models: [] } as any)
      expect(result).toBe(false)
      expect(invokeMock.mock.calls.length).toBe(0)
    })

    it('skips registration if not Tauri platform and returns false', async () => {
      isPlatformTauriMock.mockReturnValue(false)
      const result = await registerRemoteProvider({ provider: 'openai', models: [] } as any)
      expect(result).toBe(false)
      expect(invokeMock.mock.calls.length).toBe(0)
    })

    it('skips registration for remote provider with no API key and returns false', async () => {
      isPlatformTauriMock.mockReturnValue(true)
      const result = await registerRemoteProvider({ provider: 'openai', models: [] } as any)
      expect(result).toBe(false)
      expect(invokeMock.mock.calls.length).toBe(0)
    })

    it('registers remote provider with API key and returns true', async () => {
      isPlatformTauriMock.mockReturnValue(true)
      const result = await registerRemoteProvider({
        provider: 'openai',
        api_key: 'sk-12345',
        base_url: 'https://api.openai.com/v1 ', // note trailing space for trim check
        custom_header: [{ header: 'X-Custom', value: 'Test' }],
        models: [{ id: 'gpt-4' }],
      } as any)

      expect(result).toBe(true)
      expect(invokeMock.mock.calls.length).toBe(1)
      expect(invokeMock.mock.calls[0][0]).toBe('register_provider_config')
      expect(invokeMock.mock.calls[0][1]).toEqual({
        request: {
          provider: 'openai',
          api_key: 'sk-12345',
          base_url: 'https://api.openai.com/v1',
          custom_headers: [{ header: 'X-Custom', value: 'Test' }],
          models: ['gpt-4'],
        },
      })
    })

    it('registers keyless remote provider (self-hosted) and returns true', async () => {
      isPlatformTauriMock.mockReturnValue(true)
      const result = await registerRemoteProvider({
        provider: 'ollama',
        base_url: 'http://192.168.1.100:11434',
        custom_header: [],
        models: [{ id: 'llama2' }],
      } as any)

      expect(result).toBe(true)
      expect(invokeMock.mock.calls.length).toBe(1)
      expect(invokeMock.mock.calls[0][0]).toBe('register_provider_config')
      expect(invokeMock.mock.calls[0][1]).toEqual({
        request: {
          provider: 'ollama',
          api_key: undefined,
          base_url: 'http://192.168.1.100:11434',
          custom_headers: [],
          models: ['llama2'],
        },
      })
    })

    it('registers subscription provider (chatgpt) without api_key and returns true', async () => {
      isPlatformTauriMock.mockReturnValue(true)
      const result = await registerRemoteProvider({
        provider: 'chatgpt',
        custom_header: [],
        models: [{ id: 'gpt-4' }],
      } as any)

      expect(result).toBe(true)
      expect(invokeMock.mock.calls.length).toBe(1)
      expect(invokeMock.mock.calls[0][0]).toBe('register_provider_config')
      expect(invokeMock.mock.calls[0][1]).toEqual({
        request: {
          provider: 'chatgpt',
          api_key: undefined,
          base_url: undefined,
          custom_headers: [],
          models: ['gpt-4'],
        },
      })
    })

    it('propagates backend errors', async () => {
      isPlatformTauriMock.mockReturnValue(true)
      invokeMock.mockRejectedValue(new Error('Backend error'))

      let error: Error | undefined
      try {
        await registerRemoteProvider({
          provider: 'openai',
          api_key: 'sk-12345',
          models: [{ id: 'gpt-4' }],
        } as any)
      } catch (e) {
        error = e as Error
      }

      expect(error?.message).toBe('Backend error')
    })
  })

  describe('unregisterRemoteProvider', () => {
    it('skips unregistration for local provider', async () => {
      await unregisterRemoteProvider('llamacpp')
      expect(invokeMock.mock.calls.length).toBe(0)
    })

    it('unregisters remote provider with exact command and payload', async () => {
      await unregisterRemoteProvider('openai')

      expect(invokeMock.mock.calls.length).toBe(1)
      expect(invokeMock.mock.calls[0][0]).toBe('unregister_provider_config')
      expect(invokeMock.mock.calls[0][1]).toEqual({ provider: 'openai' })
    })

    it('safely swallows errors during unregistration', async () => {
      invokeMock.mockRejectedValue(new Error('Provider not found'))

      let error: Error | undefined
      try {
        await unregisterRemoteProvider('openai')
      } catch (e) {
        error = e as Error
      }

      expect(error).toBeUndefined()
    })
  })
})
