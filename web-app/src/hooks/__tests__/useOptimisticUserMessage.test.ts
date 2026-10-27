import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useOptimisticUserMessage } from '../useOptimisticUserMessage'
import type { UIMessage } from '@ai-sdk/react'

describe('useOptimisticUserMessage', () => {
  const initialState = useOptimisticUserMessage.getState()

  beforeEach(() => {
    useOptimisticUserMessage.setState(initialState, true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  const dummyMessage1: UIMessage = {
    id: 'msg-1',
    role: 'user',
    content: 'hello',
  }

  const dummyMessage2: UIMessage = {
    id: 'msg-2',
    role: 'user',
    content: 'world',
  }

  it('sets a message for one thread', () => {
    const { result } = renderHook(() => useOptimisticUserMessage())

    act(() => {
      result.current.set('thread-1', dummyMessage1)
    })

    expect(result.current.byThread).toStrictEqual({
      'thread-1': dummyMessage1,
    })
  })

  it('sets messages for several threads independently', () => {
    const { result } = renderHook(() => useOptimisticUserMessage())

    act(() => {
      result.current.set('thread-1', dummyMessage1)
      result.current.set('thread-2', dummyMessage2)
    })

    expect(result.current.byThread).toStrictEqual({
      'thread-1': dummyMessage1,
      'thread-2': dummyMessage2,
    })
  })

  it('overwrites an existing entry for a thread', () => {
    const { result } = renderHook(() => useOptimisticUserMessage())

    act(() => {
      result.current.set('thread-1', dummyMessage1)
    })

    act(() => {
      result.current.set('thread-1', dummyMessage2)
    })

    expect(result.current.byThread).toStrictEqual({
      'thread-1': dummyMessage2,
    })
  })

  it('clears an existing entry', () => {
    const { result } = renderHook(() => useOptimisticUserMessage())

    act(() => {
      result.current.set('thread-1', dummyMessage1)
      result.current.set('thread-2', dummyMessage2)
    })

    act(() => {
      result.current.clear('thread-1')
    })

    expect(result.current.byThread).toStrictEqual({
      'thread-2': dummyMessage2,
    })
  })

  it('returns identical state reference when clearing an unknown threadId', () => {
    const { result } = renderHook(() => useOptimisticUserMessage())

    act(() => {
      result.current.set('thread-1', dummyMessage1)
    })

    const byThreadBefore = result.current.byThread

    act(() => {
      result.current.clear('thread-999')
    })

    const byThreadAfter = result.current.byThread

    // Strict equality (referential check) is required
    expect(byThreadBefore).toBe(byThreadAfter)
  })
})
