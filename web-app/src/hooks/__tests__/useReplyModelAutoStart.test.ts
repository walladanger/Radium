import type { ModelProvider } from '@janhq/core'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReplyModelGateResolution } from '@/containers/ReplyModelGate'
import { useModelProvider } from '../useModelProvider'
import { useReplyModelAutoStart } from '../useReplyModelAutoStart'

const mockServiceHub = {
  models: () => ({
    getActiveModels: vi.fn(),
    stopAllModels: vi.fn(),
  }),
}

const mockSwitchToModel = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/utils/switchModel', () => ({
  switchToModel: mockSwitchToModel,
}))

const mockGetLastUsedModel = vi.hoisted(() => vi.fn().mockReturnValue(null))
vi.mock('@/utils/getModelToStart', () => ({
  getLastUsedModel: mockGetLastUsedModel,
}))

vi.mock('@/hooks/useServiceHub', () => ({
  useServiceHub: () => mockServiceHub,
}))

const MOCK_LOCAL_PROVIDER: ModelProvider = {
  provider: 'llamacpp-upstream',
  active: true,
  models: [
    {
      id: 'large-model-70b-q8',
      name: 'Large Model 70B',
      state: 'ready',
    },
    {
      id: 'tiny-model-2b-q4',
      name: 'Tiny Model 2B',
      state: 'ready',
    },
  ],
} as unknown as ModelProvider

describe('useReplyModelAutoStart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLastUsedModel.mockReturnValue(null) // Ensure no leakage between tests
    useModelProvider.setState({
      providers: [],
      selectedProvider: null,
      selectedModel: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null when there are no models', () => {
    const { result } = renderHook(() => useReplyModelAutoStart())

    let outcome: ReplyModelGateResolution | null = null
    act(() => {
      outcome = result.current.tryAutoStart()
    })

    expect(outcome).toBeNull()
    expect(mockSwitchToModel).not.toHaveBeenCalled()
  })

  it('selects and starts the most compact local model when no history exists', () => {
    useModelProvider.setState({
      providers: [MOCK_LOCAL_PROVIDER],
    })

    const { result } = renderHook(() => useReplyModelAutoStart())

    let outcome: ReplyModelGateResolution | null = null
    act(() => {
      outcome = result.current.tryAutoStart()
    })

    expect(outcome).toStrictEqual({
      outcome: 'auto_start',
      branch: 'auto_start',
      modelLabel: 'Tiny Model 2B',
    })

    expect(mockSwitchToModel).toHaveBeenCalledWith({
      modelId: 'tiny-model-2b-q4',
      providerName: 'llamacpp-upstream',
      serviceHub: mockServiceHub,
    })

    const state = useModelProvider.getState()
    expect(state.selectedProvider).toBe('llamacpp-upstream')
    expect(state.selectedModel?.id).toBe('tiny-model-2b-q4')
  })

  it('catches and logs switchToModel errors without crashing', async () => {
    const error = new Error('OOM')
    mockSwitchToModel.mockRejectedValueOnce(error)
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    useModelProvider.setState({
      providers: [MOCK_LOCAL_PROVIDER],
    })

    const { result } = renderHook(() => useReplyModelAutoStart())

    let outcome: ReplyModelGateResolution | null = null
    act(() => {
      outcome = result.current.tryAutoStart()
    })

    expect(outcome).not.toBeNull()
    expect(mockSwitchToModel).toHaveBeenCalled()

    // Wait for the floating promise to reject
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[useReplyModelAutoStart] failed to start model',
      error
    )
  })

  it('respects last used model if available', () => {
    mockGetLastUsedModel.mockReturnValue({
      provider: 'llamacpp-upstream',
      model: 'large-model-70b-q8',
    })

    useModelProvider.setState({
      providers: [MOCK_LOCAL_PROVIDER],
    })

    const { result } = renderHook(() => useReplyModelAutoStart())

    let outcome: ReplyModelGateResolution | null = null
    act(() => {
      outcome = result.current.tryAutoStart()
    })

    expect(outcome).toStrictEqual({
      outcome: 'auto_start',
      branch: 'auto_start',
      modelLabel: 'Large Model 70B', // Expects the last used larger model, not the compact tiny one
    })

    expect(mockSwitchToModel).toHaveBeenCalledWith({
      modelId: 'large-model-70b-q8',
      providerName: 'llamacpp-upstream',
      serviceHub: mockServiceHub,
    })

    const state = useModelProvider.getState()
    expect(state.selectedProvider).toBe('llamacpp-upstream')
    expect(state.selectedModel?.id).toBe('large-model-70b-q8')
  })
})
