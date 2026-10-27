import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  preserveActiveCloudModels,
  syncActiveModelsFromEngines,
  hydrateActiveModelsForRunningServer,
} from '../activeModelsSync'

const mockAppState = vi.hoisted(() => ({
  activeModels: [] as string[],
  setActiveModels: vi.fn(),
}))

vi.mock('@/hooks/useAppState', () => ({
  useAppState: {
    getState: () => mockAppState,
  },
}))

const mockLocalApiServerState = vi.hoisted(() => ({
  defaultModelLocalApiServer: null as any,
}))

vi.mock('@/hooks/useLocalApiServer', () => ({
  useLocalApiServer: {
    getState: () => mockLocalApiServerState,
  },
}))

const mockModelProviderState = vi.hoisted(() => ({
  providers: [] as any[],
}))

vi.mock('@/hooks/useModelProvider', () => ({
  useModelProvider: {
    getState: () => mockModelProviderState,
  },
}))

vi.mock('@/utils/registerRemoteProvider', () => ({
  isLocalProvider: (providerName: string) => {
    return ['llamacpp', 'mlx', 'foundation-models'].includes(providerName)
  },
}))

describe('activeModelsSync', () => {
  beforeEach(() => {
    mockAppState.activeModels = []
    mockAppState.setActiveModels.mockImplementation((models: string[]) => {
      mockAppState.activeModels = models
    })
    mockLocalApiServerState.defaultModelLocalApiServer = null
    mockModelProviderState.providers = []
  })

  describe('preserveActiveCloudModels', () => {
    it('returns empty array if no fresh local and no active cloud models', () => {
      expect(preserveActiveCloudModels(null)).toEqual([])
      expect(preserveActiveCloudModels(undefined)).toEqual([])
      expect(preserveActiveCloudModels([])).toEqual([])
    })

    it('returns fresh local models if no active cloud models', () => {
      expect(preserveActiveCloudModels(['local-model-1'])).toEqual(['local-model-1'])
    })

    it('filters out active local models and unknown models, keeping only active cloud models', () => {
      mockAppState.activeModels = ['local-model', 'cloud-model', 'unknown-model']
      mockModelProviderState.providers = [
        { provider: 'llamacpp', models: [{ id: 'local-model' }] },
        { provider: 'openai', models: [{ id: 'cloud-model' }] },
      ]
      expect(preserveActiveCloudModels([])).toEqual(['cloud-model'])
    })

    it('merges fresh local models with active cloud models', () => {
      mockAppState.activeModels = ['cloud-model']
      mockModelProviderState.providers = [
        { provider: 'openai', models: [{ id: 'cloud-model' }] },
      ]
      expect(preserveActiveCloudModels(['local-model'])).toEqual(['local-model', 'cloud-model'])
    })

    it('deduplicates models when merging', () => {
      mockAppState.activeModels = ['cloud-model']
      mockModelProviderState.providers = [
        { provider: 'openai', models: [{ id: 'cloud-model' }] },
      ]
      expect(preserveActiveCloudModels(['cloud-model', 'local-model'])).toEqual(['cloud-model', 'local-model'])
    })
  })

  describe('syncActiveModelsFromEngines', () => {
    it('updates activeModels state with merged local and cloud models', () => {
      mockAppState.activeModels = ['cloud-model']
      mockModelProviderState.providers = [
        { provider: 'openai', models: [{ id: 'cloud-model' }] },
      ]
      syncActiveModelsFromEngines(['local-model'])
      expect(mockAppState.activeModels).toEqual(['local-model', 'cloud-model'])
    })
  })

  describe('hydrateActiveModelsForRunningServer', () => {
    it('sets activeModels from local engines when no server default', async () => {
      const modelsService = {
        getActiveModels: async () => ['local-model-1', 'local-model-2'],
      }
      await hydrateActiveModelsForRunningServer(modelsService as any)
      expect(mockAppState.activeModels).toEqual(['local-model-1', 'local-model-2'])
    })

    it('handles getActiveModels error gracefully', async () => {
      const modelsService = {
        getActiveModels: async () => { throw new Error('Failed to get models') },
      }
      await hydrateActiveModelsForRunningServer(modelsService as any)
      expect(mockAppState.activeModels).toEqual([])
    })

    it('includes valid cloud server default', async () => {
      const modelsService = {
        getActiveModels: async () => ['local-model'],
      }
      mockLocalApiServerState.defaultModelLocalApiServer = {
        provider: 'openai',
        model: 'cloud-model',
      }
      mockModelProviderState.providers = [
        { provider: 'openai', api_key: 'test-key' },
      ]
      await hydrateActiveModelsForRunningServer(modelsService as any)
      expect(mockAppState.activeModels).toEqual(['local-model', 'cloud-model'])
    })

    it('excludes cloud server default if provider not found', async () => {
      const modelsService = {
        getActiveModels: async () => ['local-model'],
      }
      mockLocalApiServerState.defaultModelLocalApiServer = {
        provider: 'openai',
        model: 'cloud-model',
      }
      mockModelProviderState.providers = []
      await hydrateActiveModelsForRunningServer(modelsService as any)
      expect(mockAppState.activeModels).toEqual(['local-model'])
    })

    it('excludes cloud server default if it is a local provider', async () => {
      const modelsService = {
        getActiveModels: async () => ['local-model'],
      }
      mockLocalApiServerState.defaultModelLocalApiServer = {
        provider: 'llamacpp',
        model: 'local-model-2',
      }
      mockModelProviderState.providers = [
        { provider: 'llamacpp', api_key: 'test-key' },
      ]
      await hydrateActiveModelsForRunningServer(modelsService as any)
      expect(mockAppState.activeModels).toEqual(['local-model'])
    })

    it('excludes cloud server default if it has no api key', async () => {
      const modelsService = {
        getActiveModels: async () => ['local-model'],
      }
      mockLocalApiServerState.defaultModelLocalApiServer = {
        provider: 'openai',
        model: 'cloud-model',
      }
      mockModelProviderState.providers = [
        { provider: 'openai', api_key: '' },
      ]
      await hydrateActiveModelsForRunningServer(modelsService as any)
      expect(mockAppState.activeModels).toEqual(['local-model'])
    })

    it('deduplicates local and cloud default if same model', async () => {
      const modelsService = {
        getActiveModels: async () => ['same-model'],
      }
      mockLocalApiServerState.defaultModelLocalApiServer = {
        provider: 'openai',
        model: 'same-model',
      }
      mockModelProviderState.providers = [
        { provider: 'openai', api_key: 'test-key' },
      ]
      await hydrateActiveModelsForRunningServer(modelsService as any)
      expect(mockAppState.activeModels).toEqual(['same-model'])
    })
  })
})
