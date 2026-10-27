import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useAttachmentIngestionPrompt } from '../useAttachmentIngestionPrompt'

describe('useAttachmentIngestionPrompt', () => {
  beforeEach(() => {
    useAttachmentIngestionPrompt.setState({
      isModalOpen: false,
      currentAttachment: null,
      currentIndex: 0,
      totalCount: 0,
      sizeThreshold: 0,
      resolver: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should have correct initial state', () => {
    const { result } = renderHook(() => useAttachmentIngestionPrompt())
    expect(result.current.isModalOpen).toBe(false)
    expect(result.current.currentAttachment).toBeNull()
    expect(result.current.currentIndex).toBe(0)
    expect(result.current.totalCount).toBe(0)
    expect(result.current.sizeThreshold).toBe(0)
    expect(result.current.resolver).toBeNull()
  })

  it('should update state and return a promise on showPrompt', () => {
    const { result } = renderHook(() => useAttachmentIngestionPrompt())

    act(() => {
      result.current.showPrompt({ name: 'test.txt', size: 100 }, 50, 1, 3)
    })

    expect(result.current.isModalOpen).toBe(true)
    expect(result.current.currentAttachment).toStrictEqual({
      name: 'test.txt',
      size: 100,
    })
    expect(result.current.sizeThreshold).toBe(50)
    expect(result.current.currentIndex).toBe(1)
    expect(result.current.totalCount).toBe(3)
    expect(result.current.resolver).toBeTypeOf('function')
  })

  it('should resolve promise with choice and reset state on choose', async () => {
    const { result } = renderHook(() => useAttachmentIngestionPrompt())

    let promise: Promise<'inline' | 'embeddings' | undefined> | undefined

    act(() => {
      promise = result.current.showPrompt(
        { name: 'test.txt', size: 100 },
        50,
        1,
        3
      )
    })

    let resolvedValue: 'inline' | 'embeddings' | undefined | string =
      'unresolved'

    promise!.then((val) => {
      resolvedValue = val
    })

    act(() => {
      result.current.choose('inline')
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(resolvedValue).toBe('inline')
    expect(result.current.isModalOpen).toBe(false)
    expect(result.current.currentAttachment).toBeNull()
    expect(result.current.resolver).toBeNull()
  })

  it('should resolve promise with undefined and reset state on cancel', async () => {
    const { result } = renderHook(() => useAttachmentIngestionPrompt())

    let promise: Promise<'inline' | 'embeddings' | undefined> | undefined

    act(() => {
      promise = result.current.showPrompt(
        { name: 'test.txt', size: 100 },
        50,
        1,
        3
      )
    })

    let resolvedValue: 'inline' | 'embeddings' | undefined | string =
      'unresolved'

    promise!.then((val) => {
      resolvedValue = val
    })

    act(() => {
      result.current.cancel()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(resolvedValue).toBeUndefined()
    expect(result.current.isModalOpen).toBe(false)
    expect(result.current.currentAttachment).toBeNull()
    expect(result.current.resolver).toBeNull()
  })

  it('should handle choose when there is no active prompt', () => {
    const { result } = renderHook(() => useAttachmentIngestionPrompt())

    act(() => {
      result.current.choose('embeddings')
    })

    expect(result.current.isModalOpen).toBe(false)
    expect(result.current.currentAttachment).toBeNull()
    expect(result.current.resolver).toBeNull()
  })

  it('should handle cancel when there is no active prompt', () => {
    const { result } = renderHook(() => useAttachmentIngestionPrompt())

    act(() => {
      result.current.cancel()
    })

    expect(result.current.isModalOpen).toBe(false)
    expect(result.current.currentAttachment).toBeNull()
    expect(result.current.resolver).toBeNull()
  })
})
