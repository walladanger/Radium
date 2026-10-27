import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useTokensCount } from '../useTokensCount'
import { useServiceHub } from '../useServiceHub'
import { useModelProvider } from '../useModelProvider'
import { usePrompt } from '../usePrompt'
import { ContentType, Model } from '@janhq/core'
import { ServiceHub } from '../../services'

vi.mock('../useServiceHub')

describe('useTokensCount', () => {
  const mockGetTokensCount = vi.fn()
  const mockServiceHub = {
    models: () => ({
      getTokensCount: mockGetTokensCount,
    }),
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(useServiceHub).mockReturnValue(mockServiceHub as unknown as ServiceHub)

    act(() => {
      useModelProvider.setState({
        selectedProvider: 'llamacpp',
        selectedModel: {
          id: 'test-model',
          settings: { ctx_len: { controller_props: { value: 4096 } } },
        } as unknown as Model,
      })
      usePrompt.setState({ prompt: '' })
    })
    mockGetTokensCount.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    act(() => {
      useModelProvider.setState({ selectedProvider: 'llamacpp', selectedModel: null })
      usePrompt.setState({ prompt: '' })
    })
  })

  it('handles empty input by returning zero tokens and not calling backend', () => {
    let result: ReturnType<typeof useTokensCount> | undefined
    act(() => {
      const hook = renderHook(() => useTokensCount())
      result = hook.result.current
    })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result?.tokenCount).toBe(0)
    expect(result?.loading).toBe(false)
    expect(result?.isNearLimit).toBe(false)
    expect(mockGetTokensCount.mock.calls).toStrictEqual([])
  })

  it('calculates token count for text plus attachments', async () => {
    mockGetTokensCount.mockResolvedValueOnce(42)
    act(() => {
      usePrompt.setState({ prompt: 'Hello world' })
    })
    const uploadedFiles = [
      {
        name: 'test.png',
        type: 'image/png',
        size: 100,
        base64: 'abc',
        dataUrl: 'data:image/png;base64,abc',
      },
    ]

    let result: ReturnType<typeof useTokensCount> | undefined
    act(() => {
      const hook = renderHook(() => useTokensCount([], uploadedFiles))
      result = hook.result.current
    })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result?.tokenCount).toBe(42)

    const calls = mockGetTokensCount.mock.calls
    expect(calls.length).toBe(1)
    expect(calls[0][0]).toBe('test-model')
    expect(calls[0][1]).toHaveLength(1)
    expect(calls[0][1][0].id).toBe('temp-prompt')

    const content = calls[0][1][0].content
    expect(content).toHaveLength(2)
    expect(content[0].type).toBe(ContentType.Text)
    expect(content[0].text.value).toBe('Hello world')
    expect(content[1].type).toBe(ContentType.Image)
    expect(content[1].image_url.url).toBe('data:image/png;base64,abc')
  })

  it('debounces input calculation', async () => {
    mockGetTokensCount.mockResolvedValue(15)

    let result: ReturnType<typeof useTokensCount> | undefined
    act(() => {
      const hook = renderHook(() => useTokensCount())
      result = hook.result.current
    })

    act(() => {
      usePrompt.setState({ prompt: 'first prompt' })
    })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result?.tokenCount).toBe(0)

    act(() => {
      usePrompt.setState({ prompt: 'second prompt' })
    })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result?.tokenCount).toBe(15)

    const calls = mockGetTokensCount.mock.calls
    expect(calls.length).toBe(1)
    expect(calls[0][0]).toBe('test-model')
    expect(calls[0][1][0].content[0].text.value).toBe('second prompt')
  })

  it('handles backend error gracefully', async () => {
    mockGetTokensCount.mockRejectedValue(new Error('Backend failed'))

    let result: ReturnType<typeof useTokensCount> | undefined
    act(() => {
      const hook = renderHook(() => useTokensCount())
      result = hook.result.current
    })

    act(() => {
      usePrompt.setState({ prompt: 'trigger calculation' })
    })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result?.error).toBe('Backend failed')
    expect(result?.tokenCount).toBe(0)
    expect(result?.loading).toBe(false)
  })

  it('queues a new calculation if one is already in flight', async () => {
    let resolveFirstCalculation!: (val: number) => void
    let resolveSecondCalculation!: (val: number) => void

    mockGetTokensCount
      .mockReturnValueOnce(new Promise((res) => { resolveFirstCalculation = res }))
      .mockReturnValueOnce(new Promise((res) => { resolveSecondCalculation = res }))

    let result: ReturnType<typeof useTokensCount> | undefined
    act(() => {
      const hook = renderHook(() => useTokensCount())
      result = hook.result.current
    })

    act(() => {
      usePrompt.setState({ prompt: 'first calculation' })
    })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result?.loading).toBe(true)

    act(() => {
      usePrompt.setState({ prompt: 'second calculation' })
    })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    await act(async () => {
      resolveFirstCalculation(10)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result?.tokenCount).toBe(10)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      resolveSecondCalculation(25)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result?.tokenCount).toBe(25)
    expect(result?.loading).toBe(false)

    const calls = mockGetTokensCount.mock.calls
    expect(calls.length).toBe(2)
    expect(calls[0][1][0].content[0].text.value).toBe('first calculation')
    expect(calls[1][1][0].content[0].text.value).toBe('second calculation')
  })
})
