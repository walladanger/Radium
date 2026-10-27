import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useGeneralSetting } from '@/hooks/useGeneralSetting'
import { useModelProvider } from '@/hooks/useModelProvider'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { useReasoningEffort } from '../useReasoningEffort'

vi.mock('@/i18n/react-i18next-compat', () => ({
  useTranslation: vi.fn(),
}))

describe('useReasoningEffort', () => {
  const tMock = vi.fn((key: string) => `translated:${key}`)

  beforeEach(() => {
    vi.mocked(useTranslation).mockReturnValue({
      t: tMock,
      i18n: {} as any,
    })

    useGeneralSetting.setState({
      disableReasoning: false,
      reasoningBudget: 'medium',
    })

    useModelProvider.setState({
      selectedModel: undefined,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('should return initial defaults when no model is selected', () => {
    const { result } = renderHook(() => useReasoningEffort())

    expect(result.current).toStrictEqual({
      enabled: true,
      levels: [],
      level: undefined,
      shownLevel: undefined,
      levelLabel: undefined,
    })
  })

  it('should resolve levels and budget when model is selected and supports thinking without native effort', () => {
    act(() => {
      useModelProvider.setState({
        selectedModel: {
          id: 'test-model',
          reasoning: {
            supportsThinking: true,
          }
        } as any
      })
    })

    const { result } = renderHook(() => useReasoningEffort())

    expect(result.current).toStrictEqual({
      enabled: true,
      levels: ['low', 'medium', 'high', 'xhigh', 'max'],
      level: 'medium',
      shownLevel: 'medium',
      levelLabel: 'translated:common:reasoningEffort.medium',
    })
  })

  it('should resolve budget based on model native effort declared values', () => {
    act(() => {
      useModelProvider.setState({
        selectedModel: {
          id: 'test-model',
          reasoning: {
            supportsThinking: true,
            effortKwarg: 'reasoning_effort',
            effortValues: ['low', 'high'],
          }
        } as any
      })
      useGeneralSetting.setState({
        reasoningBudget: 'medium',
      })
    })

    const { result } = renderHook(() => useReasoningEffort())

    expect(result.current).toStrictEqual({
      enabled: true,
      levels: ['low', 'high'],
      level: 'low',
      shownLevel: 'low',
      levelLabel: 'translated:common:reasoningEffort.low',
    })
  })

  it('should disable effort if disableReasoning is true', () => {
     act(() => {
      useModelProvider.setState({
        selectedModel: {
          id: 'test-model',
          reasoning: {
            supportsThinking: true,
          }
        } as any
      })
      useGeneralSetting.setState({
        disableReasoning: true,
      })
    })

    const { result } = renderHook(() => useReasoningEffort())

    expect(result.current).toStrictEqual({
      enabled: false,
      levels: ['low', 'medium', 'high', 'xhigh', 'max'],
      level: 'medium',
      shownLevel: undefined,
      levelLabel: undefined,
    })
  })

  it('should handle budget set to off', () => {
     act(() => {
      useModelProvider.setState({
        selectedModel: {
          id: 'test-model',
          reasoning: {
            supportsThinking: true,
          }
        } as any
      })
      useGeneralSetting.setState({
        disableReasoning: false,
        reasoningBudget: 'off',
      })
    })

    const { result } = renderHook(() => useReasoningEffort())

    expect(result.current).toStrictEqual({
      enabled: true,
      levels: ['low', 'medium', 'high', 'xhigh', 'max'],
      level: undefined,
      shownLevel: undefined,
      levelLabel: undefined,
    })
  })

  it('should handle model without reasoning capability', () => {
    act(() => {
      useModelProvider.setState({
        selectedModel: {
          id: 'test-model',
        } as any
      })
    })

    const { result } = renderHook(() => useReasoningEffort())

    expect(result.current).toStrictEqual({
      enabled: true,
      levels: [],
      level: undefined,
      shownLevel: undefined,
      levelLabel: undefined,
    })
  })
})
