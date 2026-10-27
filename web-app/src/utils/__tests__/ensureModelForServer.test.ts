import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ensureModelForServer } from '../ensureModelForServer'
import { LOCAL_LLAMACPP_PROVIDER } from '@/lib/utils'

// Mocks

const mockUseModelProviderState = vi.hoisted(() => ({
  providers: [] as any[],
  selectedModel: null as any,
  selectedProvider: null as any,
  getProviderByName: (name: string) => undefined as any,
}))

vi.mock('@/hooks/useModelProvider', () => ({
  useModelProvider: {
    getState: () => mockUseModelProviderState,
  },
}))

const mockGetModelToStartResult = vi.hoisted(() => ({
  value: null as any,
}))

vi.mock('../getModelToStart', () => ({
  getModelToStart: () => mockGetModelToStartResult.value,
}))

describe('ensureModelForServer', () => {
  let fakeModelsService: any;
  let activeModels: string[];
  let startedModels: Array<{ provider: any, model: string, bypass: boolean | undefined }>;
  let stoppedModels: string[];

  beforeEach(() => {
    vi.useFakeTimers()
    activeModels = []
    startedModels = []
    stoppedModels = []

    fakeModelsService = {
      getActiveModels: async () => activeModels,
      stopModel: async (model: string) => {
        stoppedModels.push(model)
        activeModels = activeModels.filter(m => m !== model)
      },
      startModel: async (provider: any, model: string, bypassAutoUnload?: boolean) => {
        startedModels.push({ provider, model, bypass: bypassAutoUnload })
        activeModels.push(model)
      }
    }

    mockUseModelProviderState.providers = []
    mockUseModelProviderState.selectedModel = null
    mockUseModelProviderState.selectedProvider = null
    mockUseModelProviderState.getProviderByName = (name: string) => {
      return mockUseModelProviderState.providers.find((p: any) => p.provider === name)
    }

    mockGetModelToStartResult.value = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns already_loaded preferring active provider, falling back to LOCAL_LLAMACPP_PROVIDER', async () => {
    activeModels = ['model-1']

    mockUseModelProviderState.providers = [
      { provider: 'disabled-provider', active: false, models: [{ id: 'model-1' }] },
      { provider: 'active-provider', active: true, models: [{ id: 'model-1' }] },
    ] as any

    const result = await ensureModelForServer({
      modelsService: fakeModelsService
    })

    expect(result).toEqual({
      status: 'already_loaded',
      modelId: 'model-1',
      providerName: 'active-provider',
    })

    // falling back to LOCAL_LLAMACPP_PROVIDER when no provider owns it.
    mockUseModelProviderState.providers = [
      { provider: 'some-provider', active: true, models: [{ id: 'other-model' }] }
    ] as any

    const resultFallback = await ensureModelForServer({
      modelsService: fakeModelsService
    })

    expect(resultFallback).toEqual({
      status: 'already_loaded',
      modelId: 'model-1',
      providerName: LOCAL_LLAMACPP_PROVIDER,
    })
  })

  it('stops only other loaded models and returns already_loaded when override is already loaded', async () => {
    activeModels = ['model-A', 'model-override', 'model-B']

    mockUseModelProviderState.providers = [
      { provider: 'override-provider', active: true, models: [{ id: 'model-override' }] }
    ] as any

    const result = await ensureModelForServer({
      modelsService: fakeModelsService,
      modelOverride: { model: 'model-override', provider: 'override-provider' }
    })

    expect(stoppedModels).toEqual(['model-A', 'model-B'])
    expect(startedModels).toEqual([])

    expect(result).toEqual({
      status: 'already_loaded',
      modelId: 'model-override',
      providerName: 'override-provider'
    })
  })

  it('stops all loaded models, starts override model and returns loaded when override is not loaded', async () => {
    activeModels = ['model-A', 'model-B']

    const providerDef = { provider: 'override-provider', active: true, models: [{ id: 'model-override' }] }
    mockUseModelProviderState.providers = [providerDef] as any

    const resultPromise = ensureModelForServer({
      modelsService: fakeModelsService,
      modelOverride: { model: 'model-override', provider: 'override-provider' }
    })

    await vi.advanceTimersByTimeAsync(500)
    const result = await resultPromise

    expect(stoppedModels).toEqual(['model-A', 'model-B'])
    expect(startedModels).toEqual([
      { provider: providerDef, model: 'model-override', bypass: true }
    ])

    expect(result).toEqual({
      status: 'loaded',
      modelId: 'model-override',
      providerName: 'override-provider'
    })
  })

  it('falls back to getModelToStart if the override provider does not list the model', async () => {
    activeModels = []

    mockUseModelProviderState.providers = [
      { provider: 'override-provider', active: true, models: [{ id: 'some-other-model' }] }
    ] as any

    const fallbackProviderDef = { provider: 'fallback-provider', active: true, models: [{ id: 'fallback-model' }] }
    mockGetModelToStartResult.value = {
      model: 'fallback-model',
      provider: fallbackProviderDef
    }

    const resultPromise = ensureModelForServer({
      modelsService: fakeModelsService,
      modelOverride: { model: 'model-override', provider: 'override-provider' }
    })

    await vi.advanceTimersByTimeAsync(500)
    const result = await resultPromise

    expect(startedModels).toEqual([
      { provider: fallbackProviderDef, model: 'fallback-model', bypass: true }
    ])

    expect(result).toEqual({
      status: 'loaded',
      modelId: 'fallback-model',
      providerName: 'fallback-provider'
    })
  })

  it('returns no_model_available when there is nothing to start', async () => {
    activeModels = []
    mockGetModelToStartResult.value = null

    const result = await ensureModelForServer({
      modelsService: fakeModelsService
    })

    expect(startedModels).toEqual([])
    expect(result).toEqual({
      status: 'no_model_available'
    })
  })

  it('fires onLoadStart and onLoadEnd around startModel, and propagates rejection while still firing onLoadEnd', async () => {
    activeModels = []
    const providerDef = { provider: 'some-provider', active: true, models: [{ id: 'some-model' }] }
    mockGetModelToStartResult.value = {
      model: 'some-model',
      provider: providerDef
    }

    let loadStartFired = false
    let loadEndFired = false

    const onLoadStart = () => { loadStartFired = true }
    const onLoadEnd = () => { loadEndFired = true }

    // Test successful load
    const resultPromise = ensureModelForServer({
      modelsService: fakeModelsService,
      onLoadStart,
      onLoadEnd
    })

    await vi.runAllTimersAsync()
    await resultPromise

    expect(loadStartFired).toBe(true)
    expect(loadEndFired).toBe(true)

    // Test rejection
    activeModels = []
    loadStartFired = false
    loadEndFired = false

    const error = new Error('start failed')
    fakeModelsService.startModel = async () => {
      throw error
    }

    const failingPromise = ensureModelForServer({
      modelsService: fakeModelsService,
      onLoadStart,
      onLoadEnd
    })

    let caughtError;
    try {
      await failingPromise
    } catch (e) {
      caughtError = e
    }

    expect(loadStartFired).toBe(true)
    expect(caughtError).toBe(error)
    expect(loadEndFired).toBe(true)
  })
})
