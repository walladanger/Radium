import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useEffectiveAssistant } from '../useEffectiveAssistant'
import { useAssistant } from '../useAssistant'
import { useThreads } from '../useThreads'
import { Assistant, Thread } from '@janhq/core'

describe('useEffectiveAssistant', () => {
  const defaultAssistant: Assistant = {
    id: 'jan',
    name: 'Radium',
    created_at: 1747029866.542,
    parameters: {
      temperature: 0.7,
      top_k: 20,
      top_p: 0.8,
      repeat_penalty: 1.12,
    },
    avatar: '/images/transparent-logo.png',
    description: 'Radium is a helpful desktop assistant',
    instructions: 'Current date: {{current_date}}',
  }

  const customAssistant: Assistant = {
    id: 'custom-ass',
    name: 'Custom',
    created_at: 1,
    parameters: {},
  }

  const otherAssistant: Assistant = {
    id: 'other-ass',
    name: 'Other',
    created_at: 2,
    parameters: {},
  }

  beforeEach(() => {
    // Reset Zustand stores
    useAssistant.setState({
      assistants: [defaultAssistant, customAssistant, otherAssistant],
      defaultAssistantId: 'jan',
      pendingAssistant: undefined,
    }, true)

    useThreads.setState({
      threads: {},
      currentThreadId: undefined,
    }, true)
  })

  it('returns thread assistant if thread has one assigned', () => {
    useThreads.setState({
      currentThreadId: 't1',
      threads: {
        t1: {
          id: 't1',
          assistants: [customAssistant],
        } as Thread,
      },
    })

    const { result } = renderHook(() => useEffectiveAssistant())

    expect(result.current.activeAssistant).toStrictEqual(customAssistant)
  })

  it('falls back to pendingAssistant if thread has no assistant', () => {
    useThreads.setState({
      currentThreadId: 't1',
      threads: {
        t1: {
          id: 't1',
          assistants: [],
        } as Thread,
      },
    })

    useAssistant.setState({
      pendingAssistant: otherAssistant,
    })

    const { result } = renderHook(() => useEffectiveAssistant())

    expect(result.current.activeAssistant).toStrictEqual(otherAssistant)
  })

  it('falls back to default if thread has no assistant and no pending', () => {
    useThreads.setState({
      currentThreadId: 't1',
      threads: {
        t1: {
          id: 't1',
          assistants: [],
        } as Thread,
      },
    })

    const { result } = renderHook(() => useEffectiveAssistant())

    expect(result.current.activeAssistant).toStrictEqual(defaultAssistant)
  })

  it('falls back to first assistant if default assistant missing', () => {
    useAssistant.setState({
      assistants: [customAssistant, otherAssistant],
      defaultAssistantId: 'jan', // 'jan' is not in the array
      pendingAssistant: undefined,
    })

    const { result } = renderHook(() => useEffectiveAssistant())

    expect(result.current.activeAssistant).toStrictEqual(customAssistant)
  })

  it('falls back to pendingAssistant if no current thread', () => {
    useAssistant.setState({
      pendingAssistant: otherAssistant,
    })

    const { result } = renderHook(() => useEffectiveAssistant())

    expect(result.current.activeAssistant).toStrictEqual(otherAssistant)
  })

  it('falls back to default if no current thread and no pending', () => {
    const { result } = renderHook(() => useEffectiveAssistant())

    expect(result.current.activeAssistant).toStrictEqual(defaultAssistant)
  })

  it('handles assistant ID that no longer exists in assistants list (thread assigned)', () => {
    useThreads.setState({
      currentThreadId: 't1',
      threads: {
        t1: {
          id: 't1',
          assistants: [{ id: 'deleted-assistant' } as Assistant],
        } as Thread,
      },
    })

    const { result } = renderHook(() => useEffectiveAssistant())

    // Falls back to default since deleted-assistant is not found
    expect(result.current.activeAssistant).toStrictEqual(defaultAssistant)
  })

  it('selects assistant and updates pending/thread', () => {
    const mockUpdateCurrentThreadAssistant = (assistant: Assistant) => {
      useThreads.setState(state => ({
        ...state,
        threads: {
          ...state.threads,
          t1: {
            ...state.threads['t1'],
            assistants: [assistant],
          } as Thread
        }
      }))
    }

    useThreads.setState({
      currentThreadId: 't1',
      threads: {
        t1: {
          id: 't1',
          assistants: [defaultAssistant],
        } as Thread,
      },
      updateCurrentThreadAssistant: mockUpdateCurrentThreadAssistant,
    })

    const mockSetPendingAssistant = (assistant?: Assistant) => {
      useAssistant.setState({ pendingAssistant: assistant })
    }
    useAssistant.setState({
      setPendingAssistant: mockSetPendingAssistant
    })

    const { result } = renderHook(() => useEffectiveAssistant())

    act(() => {
      result.current.selectAssistant(customAssistant)
    })

    expect(useAssistant.getState().pendingAssistant).toStrictEqual(customAssistant)
    expect(useThreads.getState().threads['t1'].assistants).toStrictEqual([customAssistant])
  })

  it('updates parameter of active assistant', () => {
    let updateId = ''
    let updateKey = ''
    let updateValue: unknown

    useAssistant.setState({
      updateAssistantParam: (id, key, value) => {
        updateId = id
        updateKey = key
        updateValue = value
      }
    })

    const { result } = renderHook(() => useEffectiveAssistant())

    act(() => {
      result.current.updateParam('temperature', 0.5)
    })

    expect(updateId).toStrictEqual('jan')
    expect(updateKey).toStrictEqual('temperature')
    expect(updateValue).toStrictEqual(0.5)
  })

  it('updates instructions of active assistant', () => {
    let updateId = ''
    let updateInstructions = ''

    useAssistant.setState({
      updateAssistantInstructions: (id, instructions) => {
        updateId = id
        updateInstructions = instructions
      }
    })

    const { result } = renderHook(() => useEffectiveAssistant())

    act(() => {
      result.current.updateInstructions('New instructions')
    })

    expect(updateId).toStrictEqual('jan')
    expect(updateInstructions).toStrictEqual('New instructions')
  })
})
