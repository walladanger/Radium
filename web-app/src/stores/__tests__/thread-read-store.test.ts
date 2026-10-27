import { beforeEach, describe, expect, it } from 'vitest'
import { useThreadReadStatus } from '../thread-read-store'

const initialState = useThreadReadStatus.getState()

describe('thread read store', () => {
  beforeEach(() => {
    useThreadReadStatus.setState(initialState, true)
  })

  it('adds a thread ID to unreadThreads when markUnread is called', () => {
    const store = useThreadReadStatus.getState()
    store.markUnread('thread-1')
    expect(useThreadReadStatus.getState().unreadThreads).toEqual({
      'thread-1': true,
    })

    useThreadReadStatus.getState().markUnread('thread-2')
    expect(useThreadReadStatus.getState().unreadThreads).toEqual({
      'thread-1': true,
      'thread-2': true,
    })
  })

  it('removes a thread ID from unreadThreads when markRead is called', () => {
    const store = useThreadReadStatus.getState()
    store.markUnread('thread-1')
    store.markUnread('thread-2')
    store.markUnread('thread-3')

    useThreadReadStatus.getState().markRead('thread-2')
    expect(useThreadReadStatus.getState().unreadThreads).toEqual({
      'thread-1': true,
      'thread-3': true,
    })

    useThreadReadStatus.getState().markRead('thread-1')
    expect(useThreadReadStatus.getState().unreadThreads).toEqual({
      'thread-3': true,
    })
  })

  it('returns the exact same state object when markRead is called on an already read thread', () => {
    const store = useThreadReadStatus.getState()
    store.markUnread('thread-1')
    store.markUnread('thread-2')
    store.markRead('thread-2')

    const stateBefore = useThreadReadStatus.getState()
    useThreadReadStatus.getState().markRead('thread-2')
    const stateAfter = useThreadReadStatus.getState()

    expect(stateAfter).toBe(stateBefore)
    expect(stateAfter.unreadThreads).toBe(stateBefore.unreadThreads)
    expect(stateAfter.unreadThreads).toEqual({
      'thread-1': true,
    })
  })

  it('removes a thread ID from unreadThreads when removeThread is called', () => {
    const store = useThreadReadStatus.getState()
    store.markUnread('thread-1')
    store.markUnread('thread-2')
    store.markUnread('thread-3')

    useThreadReadStatus.getState().removeThread('thread-2')
    expect(useThreadReadStatus.getState().unreadThreads).toEqual({
      'thread-1': true,
      'thread-3': true,
    })
  })

  it('returns the exact same state object when removeThread is called on a thread not in unreadThreads', () => {
    const store = useThreadReadStatus.getState()
    store.markUnread('thread-1')

    const stateBefore = useThreadReadStatus.getState()
    useThreadReadStatus.getState().removeThread('thread-2')
    const stateAfter = useThreadReadStatus.getState()

    expect(stateAfter).toBe(stateBefore)
    expect(stateAfter.unreadThreads).toBe(stateBefore.unreadThreads)
    expect(stateAfter.unreadThreads).toEqual({
      'thread-1': true,
    })
  })

  it('clears all unread threads when clearAll is called', () => {
    const store = useThreadReadStatus.getState()
    store.markUnread('thread-1')
    store.markUnread('thread-2')
    store.markUnread('thread-3')

    expect(useThreadReadStatus.getState().unreadThreads).toEqual({
      'thread-1': true,
      'thread-2': true,
      'thread-3': true,
    })

    useThreadReadStatus.getState().clearAll()
    expect(useThreadReadStatus.getState().unreadThreads).toEqual({})
  })
})
