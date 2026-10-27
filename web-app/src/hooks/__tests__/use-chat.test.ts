import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useChat } from '../use-chat'
import { useChatSessions } from '@/stores/chat-session-store'
import { useAppState } from '@/hooks/useAppState'
import { useToolAvailable } from '@/hooks/useToolAvailable'

// Define the hoisted mocks for tracking side-effects cleanly
const mocks = vi.hoisted(() => {
  return {
    customChatTransportConstructorArgs: [] as any[],
    customChatTransportInstances: [] as any[],
    ttftMarkFromRustArgs: [] as any[],
    eventListenMap: new Map<string, (event: any) => void>(),
    unlistenCalledMap: new Map<string, boolean>(),
    chatSdkArgs: [] as any[],
  }
})

vi.mock('@ai-sdk/react', () => {
  return {
    useChat: (options: any) => {
      mocks.chatSdkArgs.push(options)
      return {
        messages: [],
        input: '',
        handleInputChange: () => {},
        handleSubmit: () => {},
        status: 'ready',
        stop: () => {},
      }
    },
    Chat: class {
      status = 'ready'
      messages = []
      constructor(options: any) {
        // ...
      }
      "~registerStatusCallback" = (cb: any) => { return () => {} }
      stop = () => {}
    }
  }
})

vi.mock('@/lib/custom-chat-transport', () => {
  return {
    CustomChatTransport: class {
      systemMessage: string | undefined
      sessionId: string | undefined
      constructor(systemMessage?: string, sessionId?: string) {
        this.systemMessage = systemMessage
        this.sessionId = sessionId
        mocks.customChatTransportConstructorArgs.push({ systemMessage, sessionId })
        mocks.customChatTransportInstances.push(this)
      }
      getThreadId() { return this.sessionId }
      updateSystemMessage(msg: string) { this.systemMessage = msg }
      setOnTokenUsage() {}
      invalidateToolsCache() {}
      refreshTools() { return Promise.resolve() }
      setContinueFromContent() {}
      updateRagToolsAvailability() { return Promise.resolve() }
    }
  }
})

vi.mock('@tauri-apps/api/event', () => {
  return {
    listen: async (event: string, handler: any) => {
      mocks.eventListenMap.set(event, handler)
      mocks.unlistenCalledMap.set(event, false)
      return () => {
        mocks.unlistenCalledMap.set(event, true)
      }
    }
  }
})

vi.mock('@/lib/ttft-timing', () => {
  return {
    ttftMarkFromRust: (marker: string, ms: number) => {
      mocks.ttftMarkFromRustArgs.push({ marker, ms })
    }
  }
})

describe('useChat', () => {
  const initialChatSessionsState = useChatSessions.getState()
  const initialAppState = useAppState.getState()
  const initialToolAvailableState = useToolAvailable.getState()

  beforeEach(() => {
    // Reset hoisted mocks
    mocks.customChatTransportConstructorArgs = []
    mocks.customChatTransportInstances = []
    mocks.ttftMarkFromRustArgs = []
    mocks.eventListenMap.clear()
    mocks.unlistenCalledMap.clear()
    mocks.chatSdkArgs = []

    // Reset stores
    useChatSessions.setState(initialChatSessionsState, true)
    useAppState.setState(initialAppState, true)
    useToolAvailable.setState(initialToolAvailableState, true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.clearAllTimers()
  })

  it('creates a new CustomChatTransport when no session transport exists', () => {
    const { result } = renderHook(() => useChat({ sessionId: 'session-1', systemMessage: 'hello' }))

    expect(mocks.customChatTransportConstructorArgs.length).toBe(1)
    expect(mocks.customChatTransportConstructorArgs[0]).toStrictEqual({ systemMessage: 'hello', sessionId: 'session-1' })
    expect(result.current.messages).toStrictEqual([])
    expect(result.current.status).toBe('ready')
  })

  it('reuses existing session transport when one exists', () => {
    const existingTransport = {
      getThreadId: () => 'session-1',
      updateSystemMessage: vi.fn(),
      setOnTokenUsage: vi.fn(),
      invalidateToolsCache: vi.fn(),
      refreshTools: vi.fn().mockResolvedValue(undefined),
    } as any

    useChatSessions.setState({
      sessions: {
        'session-1': {
          chat: { status: 'ready', messages: [] } as any,
          transport: existingTransport,
          status: 'ready',
          isStreaming: false,
          unsubscribers: [],
          data: { tools: [], messages: [], idMap: new Map() }
        }
      }
    } as any)

    renderHook(() => useChat({ sessionId: 'session-1' }))

    expect(mocks.customChatTransportConstructorArgs.length).toBe(0)
  })

  it('updates system message on transport without recreating it', () => {
    const existingTransport = {
      getThreadId: () => 'session-1',
      systemMessage: undefined as string | undefined,
      updateSystemMessage: function(msg: string) { this.systemMessage = msg },
      setOnTokenUsage: () => {},
      invalidateToolsCache: () => {},
      refreshTools: () => Promise.resolve(),
    } as any

    useChatSessions.setState({
      sessions: {
        'session-1': {
          chat: { status: 'ready', messages: [] } as any,
          transport: existingTransport,
          status: 'ready',
          isStreaming: false,
          unsubscribers: [],
          data: { tools: [], messages: [], idMap: new Map() }
        }
      }
    } as any)

    const { rerender } = renderHook((props: any) => useChat(props), {
      initialProps: { sessionId: 'session-1', systemMessage: 'initial' }
    })

    expect(mocks.customChatTransportConstructorArgs.length).toBe(0)
    expect(existingTransport.systemMessage).toBe('initial')

    rerender({ sessionId: 'session-1', systemMessage: 'updated' })

    expect(existingTransport.systemMessage).toBe('updated')
  })

  it('registers and unregisters ttft-timing listener on mount/unmount', async () => {
    let unmountHook: () => void = () => {}

    await act(async () => {
      const { unmount } = renderHook(() => useChat({ sessionId: 'session-1' }))
      unmountHook = unmount
      // wait for effect to run async setup
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(mocks.eventListenMap.has('ttft-timing')).toBe(true)

    const handler = mocks.eventListenMap.get('ttft-timing')!

    // Simulate event
    handler({ payload: { marker: 'zetaProxyIn', ms: 100 } })

    expect(mocks.ttftMarkFromRustArgs.length).toBe(1)
    expect(mocks.ttftMarkFromRustArgs[0]).toStrictEqual({ marker: 'zetaProxyIn', ms: 100 })

    await act(async () => {
      unmountHook()
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(mocks.unlistenCalledMap.get('ttft-timing')).toBe(true)
  })

  it('invalidates tool cache and refreshes tools when tool dependencies change', () => {
    let invalidateCalled = false
    let refreshCalled = false

    const existingTransport = {
      getThreadId: () => 'session-1',
      updateSystemMessage: () => {},
      setOnTokenUsage: () => {},
      invalidateToolsCache: () => { invalidateCalled = true },
      refreshTools: () => { refreshCalled = true; return Promise.resolve() },
    } as any

    useChatSessions.setState({
      sessions: {
        'session-1': {
          chat: { status: 'ready', messages: [] } as any,
          transport: existingTransport,
          status: 'ready',
          isStreaming: false,
          unsubscribers: [],
          data: { tools: [], messages: [], idMap: new Map() }
        }
      }
    } as any)

    renderHook(() => useChat({ sessionId: 'session-1' }))

    // Initial render effect sets these
    expect(invalidateCalled).toBe(true)
    expect(refreshCalled).toBe(true)

    invalidateCalled = false
    refreshCalled = false

    // Trigger state change
    act(() => {
      useAppState.setState({ mcpToolNames: new Set(['new-tool']) })
    })

    expect(invalidateCalled).toBe(true)
    expect(refreshCalled).toBe(true)
  })

  it('updates transport properties (onTokenUsage)', () => {
     let onTokenUsageSet: any = null

    const existingTransport = {
      getThreadId: () => 'session-1',
      updateSystemMessage: () => {},
      setOnTokenUsage: (cb: any) => { onTokenUsageSet = cb },
      invalidateToolsCache: () => {},
      refreshTools: () => Promise.resolve(),
    } as any

    useChatSessions.setState({
      sessions: {
        'session-1': {
          chat: { status: 'ready', messages: [] } as any,
          transport: existingTransport,
          status: 'ready',
          isStreaming: false,
          unsubscribers: [],
          data: { tools: [], messages: [], idMap: new Map() }
        }
      }
    } as any)

    const cb1 = () => {}
    const { rerender } = renderHook((props: any) => useChat(props), {
      initialProps: { sessionId: 'session-1', onTokenUsage: cb1 }
    })

    expect(onTokenUsageSet).toBe(cb1)

    const cb2 = () => {}
    rerender({ sessionId: 'session-1', onTokenUsage: cb2 })

    expect(onTokenUsageSet).toBe(cb2)
  })

  it('exposes setContinueFromContent and updateRagToolsAvailability mapped to transport', async () => {
    let continueContent = ''
    let ragUpdateArgs: any[] = []

    const existingTransport = {
      getThreadId: () => 'session-1',
      updateSystemMessage: () => {},
      setOnTokenUsage: () => {},
      invalidateToolsCache: () => {},
      refreshTools: () => Promise.resolve(),
      setContinueFromContent: (content: string) => { continueContent = content },
      updateRagToolsAvailability: (a: boolean, b: boolean, c: boolean) => { ragUpdateArgs = [a, b, c]; return Promise.resolve() }
    } as any

    useChatSessions.setState({
      sessions: {
        'session-1': {
          chat: { status: 'ready', messages: [] } as any,
          transport: existingTransport,
          status: 'ready',
          isStreaming: false,
          unsubscribers: [],
          data: { tools: [], messages: [], idMap: new Map() }
        }
      }
    } as any)

    const { result } = renderHook(() => useChat({ sessionId: 'session-1' }))

    act(() => {
      result.current.setContinueFromContent('test content')
    })
    expect(continueContent).toBe('test content')

    await act(async () => {
      await result.current.updateRagToolsAvailability(true, false, true)
    })
    expect(ragUpdateArgs).toStrictEqual([true, false, true])
  })
})
