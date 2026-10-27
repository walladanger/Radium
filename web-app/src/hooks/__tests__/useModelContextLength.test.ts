import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EngineManager } from '@janhq/core'
import { useModelContextLength } from '../useModelContextLength'
import { useModelProvider } from '../../hooks/useModelProvider'
import { useServiceStore } from '../../hooks/useServiceHub'
import { useAppState } from '../../hooks/useAppState'

vi.mock('@janhq/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@janhq/core')>()
  return {
    ...actual,
    EngineManager: {
      instance: vi.fn(),
    },
  }
})

describe('useModelContextLength', () => {
  let mockGetMaxCtxTrain: ReturnType<typeof vi.fn>
  let mockStopModel: ReturnType<typeof vi.fn>
  let mockStartModel: ReturnType<typeof vi.fn>
  let mockGetActiveModels: ReturnType<typeof vi.fn>
  let mockUpdateSettings: ReturnType<typeof vi.fn>
  let mockUpdateProvider: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockGetMaxCtxTrain = vi.fn()
    const mockEngineManager = {
      get: vi.fn(() => ({
        getMaxCtxTrain: mockGetMaxCtxTrain,
      })),
    }
    vi.mocked(EngineManager.instance).mockReturnValue(mockEngineManager as any)

    act(() => {
      useModelProvider.setState({
        providers: [],
        selectedProvider: null,
        selectedModel: null,
      })
    })

    mockStopModel = vi.fn()
    mockStartModel = vi.fn()
    mockGetActiveModels = vi.fn().mockResolvedValue([])
    mockUpdateSettings = vi.fn()

    act(() => {
      const mockServiceHub = {
        models: () => ({
          stopModel: mockStopModel,
          startModel: mockStartModel,
          getActiveModels: mockGetActiveModels,
        }),
        providers: () => ({
          updateSettings: mockUpdateSettings,
        }),
      }
      useServiceStore.setState({ serviceHub: mockServiceHub as any })
      useAppState.setState({ activeModels: [] })
    })

    vi.useFakeTimers()
  })

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers()
    })
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should initialize with default values when no provider is selected', () => {
    let hookResult: any
    act(() => {
      const { result } = renderHook(() => useModelContextLength())
      hookResult = result
    })
    act(() => {
      vi.runAllTimers()
    })

    expect(hookResult.current.available).toBe(false)
    expect(hookResult.current.draft).toBe(0)
    expect(hookResult.current.sliderMax).toBe(512 * 1024)
    expect(hookResult.current.fitAvailable).toBe(false)
  })

  it('resolves the maximum context from the engine for a local provider', async () => {
    mockGetMaxCtxTrain.mockResolvedValue(32768)

    const model = {
      id: 'test-model',
      settings: {
        ctx_len: {
          controller_props: {
            value: 4096,
            min: 1024,
            max: 0,
            step: 1024,
          },
        },
      },
    }
    const provider = {
      provider: 'llamacpp',
      models: [model],
      settings: [{ key: 'fit', controller_props: { value: false } }],
    }

    act(() => {
      useModelProvider.setState({
        providers: [provider as any],
        selectedProvider: 'llamacpp',
        selectedModel: model as any,
      })
    })

    let hookResult: any
    act(() => {
      const { result } = renderHook(() => useModelContextLength())
      hookResult = result
    })

    await act(async () => {
      vi.runAllTimers()
      await new Promise(process.nextTick)
    })

    expect(hookResult.current.sliderMax).toBe(32768)
    expect(hookResult.current.available).toBe(true)
    expect(hookResult.current.draft).toBe(4096)
    expect(hookResult.current.fitAvailable).toBe(true)
  })

  it('falls back to FALLBACK_MAX_CONTEXT if getMaxCtxTrain rejects', async () => {
    mockGetMaxCtxTrain.mockRejectedValue(new Error('Engine error'))

    const model = {
      id: 'test-model',
      settings: {
        ctx_len: { controller_props: { value: 4096 } },
      },
    }
    const provider = {
      provider: 'llamacpp',
      models: [model],
      settings: [],
    }

    act(() => {
      useModelProvider.setState({
        providers: [provider as any],
        selectedProvider: 'llamacpp',
        selectedModel: model as any,
      })
    })

    let hookResult: any
    act(() => {
      const { result } = renderHook(() => useModelContextLength())
      hookResult = result
    })

    await act(async () => {
      vi.runAllTimers()
      await new Promise(process.nextTick)
    })

    expect(hookResult.current.sliderMax).toBe(512 * 1024)
  })

  it('handles edge values for missing or non-numeric slider bounds', async () => {
    mockGetMaxCtxTrain.mockResolvedValue(undefined)

    const model = {
      id: 'test-model',
      settings: {
        ctx_len: {
          controller_props: {
            value: 'invalid', // non-numeric
            min: -100,
            max: -50,
            step: 0,
          },
        },
      },
    }
    const provider = {
      provider: 'llamacpp',
      models: [model],
      settings: [],
    }

    act(() => {
      useModelProvider.setState({
        providers: [provider as any],
        selectedProvider: 'llamacpp',
        selectedModel: model as any,
      })
    })

    let hookResult: any
    act(() => {
      const { result } = renderHook(() => useModelContextLength())
      hookResult = result
    })

    await act(async () => {
      vi.runAllTimers()
      await new Promise(process.nextTick)
    })

    expect(hookResult.current.draft).toBe(0)
    // Validate edge values gracefully resolve according to Math.max fallbacks
    expect(hookResult.current.sliderMin).toBe(1)
    expect(hookResult.current.sliderStep).toBe(1024)
    expect(hookResult.current.sliderMax).toBe(512 * 1024)
  })

  it('commit updates model settings and restarts active model', async () => {
    const updateProviderSpy = vi.spyOn(useModelProvider.getState(), 'updateProvider')
    mockGetActiveModels.mockResolvedValue(['test-model'])

    const model = {
      id: 'test-model',
      settings: {
        ctx_len: { controller_props: { value: 4096 } },
      },
    }
    const provider = {
      provider: 'llamacpp',
      models: [model],
      settings: [],
    }

    act(() => {
      useModelProvider.setState({
        providers: [provider as any],
        selectedProvider: 'llamacpp',
        selectedModel: model as any,
      })
    })

    let hookResult: any
    act(() => {
      const { result } = renderHook(() => useModelContextLength())
      hookResult = result
    })

    await act(async () => {
      hookResult.current.commit(8192)
      await new Promise(process.nextTick)
    })

    expect(updateProviderSpy).toHaveBeenCalledWith('llamacpp', expect.objectContaining({
      models: expect.arrayContaining([
        expect.objectContaining({
          settings: expect.objectContaining({
            ctx_len: expect.objectContaining({
              controller_props: expect.objectContaining({
                value: 8192
              })
            })
          })
        })
      ])
    }))

    await act(async () => {
      vi.runAllTimers()
      await new Promise(process.nextTick)
    })

    expect(mockStopModel).toHaveBeenCalledWith('test-model')
    expect(mockStartModel).toHaveBeenCalledWith(expect.anything(), 'test-model', true)
  })

  it('setFit updates provider settings and restarts active model', async () => {
    const updateProviderSpy = vi.spyOn(useModelProvider.getState(), 'updateProvider')
    mockGetActiveModels.mockResolvedValue(['test-model'])

    const model = {
      id: 'test-model',
      settings: {
        ctx_len: { controller_props: { value: 4096 } },
      },
    }
    const provider = {
      provider: 'llamacpp',
      models: [model],
      settings: [{ key: 'fit', controller_props: { value: false } }],
    }

    act(() => {
      useModelProvider.setState({
        providers: [provider as any],
        selectedProvider: 'llamacpp',
        selectedModel: model as any,
      })
    })

    let hookResult: any
    act(() => {
      const { result } = renderHook(() => useModelContextLength())
      hookResult = result
    })

    await act(async () => {
      hookResult.current.setFit(true)
      await new Promise(process.nextTick)
    })

    expect(mockUpdateSettings).toHaveBeenCalledWith('llamacpp', expect.arrayContaining([
      expect.objectContaining({
        key: 'fit',
        controller_props: expect.objectContaining({ value: true })
      })
    ]))

    expect(updateProviderSpy).toHaveBeenCalledWith('llamacpp', expect.objectContaining({
      settings: expect.arrayContaining([
        expect.objectContaining({
          key: 'fit',
          controller_props: expect.objectContaining({ value: true })
        })
      ])
    }))

    await act(async () => {
      vi.runAllTimers()
      await new Promise(process.nextTick)
    })

    expect(mockStopModel).toHaveBeenCalledWith('test-model')
  })

  it('unmount cancels pending user-initiated restart', async () => {
    mockGetActiveModels.mockResolvedValue(['test-model'])

    const model = {
      id: 'test-model',
      settings: {
        ctx_len: { controller_props: { value: 4096 } },
      },
    }
    const provider = {
      provider: 'llamacpp',
      models: [model],
      settings: [],
    }

    act(() => {
      useModelProvider.setState({
        providers: [provider as any],
        selectedProvider: 'llamacpp',
        selectedModel: model as any,
      })
    })

    let hookResult: any
    let renderHookResult: any
    act(() => {
      renderHookResult = renderHook(() => useModelContextLength())
      hookResult = renderHookResult.result
    })

    await act(async () => {
      hookResult.current.commit(8192)
      await new Promise(process.nextTick)
    })

    act(() => {
      renderHookResult.unmount()
    })

    await act(async () => {
      vi.runAllTimers()
      await new Promise(process.nextTick)
    })

    expect(mockStopModel).not.toHaveBeenCalled()
    expect(mockStartModel).not.toHaveBeenCalled()
  })
})
