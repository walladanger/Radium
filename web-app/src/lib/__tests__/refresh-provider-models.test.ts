import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshProviderModels } from '../refresh-provider-models'

const stubs = vi.hoisted(() => {
  return {
    toastErrorCalls: [] as Array<any>,
    toastSuccessCalls: [] as Array<any>,
    toastWarningCalls: [] as Array<any>,

    setProvidersCalls: [] as Array<any>,
    updateProviderCalls: [] as Array<any>,

    registryState: { error: null as string | null },
    registryRefreshCalls: 0,
    registryRefreshError: null as Error | null,

    isLocalProviderReturn: false,

    getProvidersReturn: [] as any[],
    getProvidersError: null as Error | null,

    fetchModelsFromProviderCalls: [] as Array<any>,
    fetchModelsFromProviderReturn: [] as string[],
    fetchModelsFromProviderError: null as Error | null,

    getProviderByNameReturn: null as any | null,
    getModelCapabilitiesReturn: { someCapability: true },

    consoleErrorCalls: [] as Array<any>,
    consoleWarnCalls: [] as Array<any>,
    consoleInfoCalls: [] as Array<any>,
  }
})

vi.mock('sonner', () => ({
  toast: {
    error: (msg: string, options: any) => {
      stubs.toastErrorCalls.push({ msg, options })
    },
    success: (msg: string, options: any) => {
      stubs.toastSuccessCalls.push({ msg, options })
    },
    warning: (msg: string, options: any) => {
      stubs.toastWarningCalls.push({ msg, options })
    },
  },
}))

vi.mock('@/stores/provider-registry-store', () => ({
  useProviderRegistryStore: {
    getState: () => ({
      refresh: async () => {
        stubs.registryRefreshCalls++
        if (stubs.registryRefreshError) {
          throw stubs.registryRefreshError
        }
      },
      error: stubs.registryState.error,
    }),
  },
}))

vi.mock('@/utils/registerRemoteProvider', () => ({
  isLocalProvider: (providerName: string) => {
    return stubs.isLocalProviderReturn
  },
}))

vi.mock('@/lib/models', () => ({
  getModelCapabilities: () => {
    return stubs.getModelCapabilitiesReturn
  },
}))

vi.mock('@/hooks/useModelProvider', () => ({
  useModelProvider: {
    getState: () => ({
      getProviderByName: (name: string) => {
        return stubs.getProviderByNameReturn
      },
    }),
  },
}))

describe('refreshProviderModels', () => {
  let mockConsoleError: any
  let mockConsoleWarn: any
  let mockConsoleInfo: any

  beforeEach(() => {
    stubs.toastErrorCalls = []
    stubs.toastSuccessCalls = []
    stubs.toastWarningCalls = []
    stubs.setProvidersCalls = []
    stubs.updateProviderCalls = []

    stubs.registryState.error = null
    stubs.registryRefreshCalls = 0
    stubs.registryRefreshError = null

    stubs.isLocalProviderReturn = false

    stubs.getProvidersReturn = []
    stubs.getProvidersError = null

    stubs.fetchModelsFromProviderCalls = []
    stubs.fetchModelsFromProviderReturn = []
    stubs.fetchModelsFromProviderError = null

    stubs.getProviderByNameReturn = null

    stubs.consoleErrorCalls = []
    stubs.consoleWarnCalls = []
    stubs.consoleInfoCalls = []

    mockConsoleError = vi
      .spyOn(console, 'error')
      .mockImplementation((...args) => {
        stubs.consoleErrorCalls.push(args)
      })
    mockConsoleWarn = vi
      .spyOn(console, 'warn')
      .mockImplementation((...args) => {
        stubs.consoleWarnCalls.push(args)
      })
    mockConsoleInfo = vi
      .spyOn(console, 'info')
      .mockImplementation((...args) => {
        stubs.consoleInfoCalls.push(args)
      })
  })

  afterEach(() => {
    mockConsoleError.mockRestore()
    mockConsoleWarn.mockRestore()
    mockConsoleInfo.mockRestore()
  })

  const t = (key: string, options?: Record<string, unknown>) => {
    if (!options) return key
    return `${key}:${JSON.stringify(options)}`
  }

  const baseProvider = {
    provider: 'my-provider',
    models: [{ id: 'existing-1' }],
    base_url: 'https://api.my-provider.com/v1',
  } as any

  const setProviders = (providers: any[]) => {
    stubs.setProvidersCalls.push(providers)
  }

  const updateProvider = (providerName: string, data: any) => {
    stubs.updateProviderCalls.push({ providerName, data })
  }

  const serviceHub = {
    providers: () => ({
      getProviders: async () => {
        if (stubs.getProvidersError) throw stubs.getProvidersError
        return stubs.getProvidersReturn
      },
      fetchModelsFromProvider: async (provider: any) => {
        stubs.fetchModelsFromProviderCalls.push(provider)
        if (stubs.fetchModelsFromProviderError) {
          throw stubs.fetchModelsFromProviderError
        }
        return stubs.fetchModelsFromProviderReturn
      },
    }),
  } as any

  it('returns early and shows error toast when registry store has an error after refresh', async () => {
    stubs.registryState.error = 'Network error fetching registry'

    await refreshProviderModels({
      provider: baseProvider,
      serviceHub,
      setProviders,
      updateProvider,
      t,
    })

    expect(stubs.toastErrorCalls).toEqual([
      {
        msg: 'providers:models',
        options: { description: 'Network error fetching registry' },
      },
    ])
    expect(stubs.setProvidersCalls).toEqual([])
    expect(stubs.updateProviderCalls).toEqual([])
  })

  it('skips live fetch when provider is local', async () => {
    stubs.isLocalProviderReturn = true

    const registryProviders = [
      {
        provider: 'my-provider',
        models: [{ id: 'existing-1' }, { id: 'new-reg-1' }],
      }
    ]
    stubs.getProvidersReturn = registryProviders

    await refreshProviderModels({
      provider: baseProvider,
      serviceHub,
      setProviders,
      updateProvider,
      t,
    })

    expect(stubs.fetchModelsFromProviderCalls).toEqual([])
    expect(stubs.setProvidersCalls).toEqual([registryProviders])
    expect(stubs.updateProviderCalls).toEqual([])
    expect(stubs.toastSuccessCalls).toEqual([
      {
        msg: 'providers:models',
        options: {
          description: 'providers:refreshModelsSuccess:{"count":1,"provider":"my-provider"}',
        },
      }
    ])
  })

  it('skips live fetch when registry explicitly opts out', async () => {
    const registryProviders = [
      {
        provider: 'my-provider',
        supports_model_listing: false,
        models: [{ id: 'existing-1' }, { id: 'new-reg-2' }],
      }
    ]
    stubs.getProvidersReturn = registryProviders

    await refreshProviderModels({
      provider: baseProvider,
      serviceHub,
      setProviders,
      updateProvider,
      t,
    })

    expect(stubs.fetchModelsFromProviderCalls).toEqual([])
    expect(stubs.setProvidersCalls).toEqual([registryProviders])
    expect(stubs.updateProviderCalls).toEqual([])
    expect(stubs.toastSuccessCalls).toEqual([
      {
        msg: 'providers:models',
        options: {
          description: 'providers:refreshModelsSuccess:{"count":1,"provider":"my-provider"}',
        },
      }
    ])
  })

  it('fetches live models and dedupes them into updateProvider', async () => {
    const registryProviders = [
      {
        provider: 'my-provider',
        models: [{ id: 'existing-1' }, { id: 'new-reg-1' }],
      }
    ]
    stubs.getProvidersReturn = registryProviders
    stubs.fetchModelsFromProviderReturn = [
      'existing-1', // duplicate of provider.models
      'new-reg-1',  // duplicate of registry addition
      'live-1',     // genuinely new
      'live-1',     // duplicate in live models themselves
      'live-2'      // genuinely new
    ]

    stubs.getProviderByNameReturn = {
      models: [{ id: 'existing-1' }, { id: 'old-custom' }]
    }

    await refreshProviderModels({
      provider: baseProvider,
      serviceHub,
      setProviders,
      updateProvider,
      t,
    })

    expect(stubs.fetchModelsFromProviderCalls).toEqual([baseProvider])
    expect(stubs.setProvidersCalls).toEqual([registryProviders])

    expect(stubs.toastSuccessCalls).toEqual([
      {
        msg: 'providers:models',
        options: {
          description: 'providers:refreshModelsSuccess:{"count":3,"provider":"my-provider"}',
        },
      }
    ])

    expect(stubs.updateProviderCalls).toEqual([
      {
        providerName: 'my-provider',
        data: {
          models: [
            { id: 'existing-1' },
            { id: 'old-custom' },
            {
              id: 'live-1',
              model: 'live-1',
              name: 'live-1',
              capabilities: { someCapability: true },
              version: '1.0'
            },
            {
              id: 'live-2',
              model: 'live-2',
              name: 'live-2',
              capabilities: { someCapability: true },
              version: '1.0'
            }
          ]
        }
      }
    ])
  })

  it('does not call updateProvider when all live ids already exist', async () => {
    const registryProviders = [
      {
        provider: 'my-provider',
        models: [{ id: 'existing-1' }], // no new registry models
      }
    ]
    stubs.getProvidersReturn = registryProviders
    stubs.fetchModelsFromProviderReturn = ['existing-1'] // only duplicate models

    await refreshProviderModels({
      provider: baseProvider,
      serviceHub,
      setProviders,
      updateProvider,
      t,
    })

    expect(stubs.fetchModelsFromProviderCalls).toEqual([baseProvider])
    expect(stubs.setProvidersCalls).toEqual([registryProviders])
    expect(stubs.updateProviderCalls).toEqual([])

    expect(stubs.toastSuccessCalls).toEqual([
      {
        msg: 'providers:models',
        options: {
          description: 'providers:noNewModels'
        }
      }
    ])
  })

  it('shows warning toast when live fetch fails but registry merge succeeds', async () => {
    const registryProviders = [
      {
        provider: 'my-provider',
        models: [{ id: 'existing-1' }], // no new registry models
      }
    ]
    stubs.getProvidersReturn = registryProviders
    stubs.fetchModelsFromProviderError = new Error('Live endpoint unreachable')

    await refreshProviderModels({
      provider: baseProvider,
      serviceHub,
      setProviders,
      updateProvider,
      t,
    })

    expect(stubs.fetchModelsFromProviderCalls).toEqual([baseProvider])
    expect(stubs.setProvidersCalls).toEqual([registryProviders])
    expect(stubs.updateProviderCalls).toEqual([])

    expect(stubs.toastWarningCalls).toEqual([
      {
        msg: 'providers:models',
        options: {
          description: 'providers:refreshModelsLiveFailed:{"provider":"my-provider","error":"Live endpoint unreachable"}'
        }
      }
    ])
  })

  it('handles unexpected outer exceptions by showing an error toast', async () => {
    stubs.getProvidersError = new Error('Unexpected crash in getProviders')

    await refreshProviderModels({
      provider: baseProvider,
      serviceHub,
      setProviders,
      updateProvider,
      t,
    })

    expect(stubs.setProvidersCalls).toEqual([])
    expect(stubs.updateProviderCalls).toEqual([])
    expect(stubs.toastErrorCalls).toEqual([
      {
        msg: 'providers:models',
        options: {
          description: 'Unexpected crash in getProviders'
        }
      }
    ])
  })
})
