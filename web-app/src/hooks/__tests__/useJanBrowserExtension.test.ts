import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useJanBrowserExtension } from '../useJanBrowserExtension'

const {
  mockEnsureConnectorReviewed,
  mockCheckConnected,
  mockActivate,
  mockDeactivate,
  mockEditServer,
  mockSyncServers,
  mockToastSuccess,
  mockToastError,
} = vi.hoisted(() => {
  return {
    mockEnsureConnectorReviewed: vi.fn(),
    mockCheckConnected: vi.fn(),
    mockActivate: vi.fn(),
    mockDeactivate: vi.fn(),
    mockEditServer: vi.fn(),
    mockSyncServers: vi.fn(),
    mockToastSuccess: vi.fn(),
    mockToastError: vi.fn(),
  }
})

let mockMcpServers: Record<string, { active: boolean; name: string } | undefined> = {}

vi.mock('@/hooks/useConnectorReview', () => ({
  ensureConnectorReviewed: mockEnsureConnectorReviewed,
}))

vi.mock('sonner', () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}))

vi.mock('@/hooks/useMCPServers', () => ({
  useMCPServers: () => ({
    mcpServers: mockMcpServers,
    editServer: mockEditServer,
    syncServers: mockSyncServers,
  })
}))

vi.mock('@/hooks/useServiceHub', () => ({
  useServiceHub: () => ({
    mcp: () => ({
      checkJanBrowserExtensionConnected: mockCheckConnected,
      activateMCPServer: mockActivate,
      deactivateMCPServer: mockDeactivate,
    })
  })
}))

const JAN_BROWSER_MCP_NAME = 'Jan Browser MCP'

describe('useJanBrowserExtension', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockMcpServers = {
      [JAN_BROWSER_MCP_NAME]: {
        active: false,
        name: JAN_BROWSER_MCP_NAME,
      }
    }

    mockCheckConnected.mockResolvedValue(false)
    mockActivate.mockResolvedValue(undefined)
    mockDeactivate.mockResolvedValue(undefined)
    mockEditServer.mockImplementation(() => {})
    mockSyncServers.mockResolvedValue(undefined)

    mockEnsureConnectorReviewed.mockResolvedValue(true)
    mockToastSuccess.mockImplementation(() => {})
    mockToastError.mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('exposes initial state when config is missing', () => {
    mockMcpServers = {}

    const { result } = renderHook(() => useJanBrowserExtension())

    expect(result.current.hasConfig).toBe(false)
    expect(result.current.isActive).toBe(false)
    expect(result.current.dialogOpen).toBe(false)
    expect(result.current.dialogState).toBe('closed')
    expect(result.current.isLoading).toBe(false)
  })

  it('exposes initial state when inactive', () => {
    const { result } = renderHook(() => useJanBrowserExtension())

    expect(result.current.hasConfig).toBe(true)
    expect(result.current.isActive).toBe(false)
    expect(result.current.dialogOpen).toBe(false)
    expect(result.current.dialogState).toBe('closed')
    expect(result.current.isLoading).toBe(false)
  })

  it('exposes initial state when active', () => {
    mockMcpServers[JAN_BROWSER_MCP_NAME] = {
      active: true,
      name: JAN_BROWSER_MCP_NAME,
    }

    const { result } = renderHook(() => useJanBrowserExtension())

    expect(result.current.hasConfig).toBe(true)
    expect(result.current.isActive).toBe(true)
    expect(result.current.dialogOpen).toBe(false)
    expect(result.current.dialogState).toBe('closed')
    expect(result.current.isLoading).toBe(false)
  })

  it('toggleBrowser: shows error if no config', async () => {
    mockMcpServers = {}
    const { result } = renderHook(() => useJanBrowserExtension())

    await act(async () => {
      await result.current.toggleBrowser()
    })

    expect(mockToastError).toHaveBeenCalledWith('Browser extension MCP not found', expect.any(Object))
    expect(result.current.isLoading).toBe(false)
  })

  it('toggleBrowser: deactivates if currently active', async () => {
    mockMcpServers[JAN_BROWSER_MCP_NAME] = {
      active: true,
      name: JAN_BROWSER_MCP_NAME,
    }
    const { result } = renderHook(() => useJanBrowserExtension())

    await act(async () => {
      await result.current.toggleBrowser()
    })

    expect(mockDeactivate).toHaveBeenCalledWith(JAN_BROWSER_MCP_NAME)
    expect(mockToastSuccess).toHaveBeenCalledWith('Radium browser tools disabled')
    expect(mockEditServer).toHaveBeenCalledWith(JAN_BROWSER_MCP_NAME, expect.objectContaining({ active: false }))
    expect(mockSyncServers).toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
  })

  it('toggleBrowser: aborts if ensureConnectorReviewed returns false', async () => {
    mockEnsureConnectorReviewed.mockResolvedValue(false)
    const { result } = renderHook(() => useJanBrowserExtension())

    await act(async () => {
      await result.current.toggleBrowser()
    })

    expect(mockActivate).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
  })

  it('toggleBrowser: activates and connects successfully', async () => {
    vi.useFakeTimers()
    mockCheckConnected.mockResolvedValue(true)

    const { result } = renderHook(() => useJanBrowserExtension())

    const togglePromise = act(async () => {
      const p = result.current.toggleBrowser()
      await vi.runAllTimersAsync()
      await p
    })

    await togglePromise

    expect(mockActivate).toHaveBeenCalledWith(JAN_BROWSER_MCP_NAME, expect.objectContaining({ active: true }))
    expect(mockToastSuccess).toHaveBeenCalledWith('Radium browser tools enabled')
    expect(mockEditServer).toHaveBeenCalledWith(JAN_BROWSER_MCP_NAME, expect.objectContaining({ active: true }))
    expect(result.current.dialogState).toBe('closed')
    expect(result.current.dialogOpen).toBe(false)
    expect(result.current.isLoading).toBe(false)
  })

  it('toggleBrowser: activates but fails to connect (timeout)', async () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useJanBrowserExtension())

    const togglePromise = act(async () => {
      const p = result.current.toggleBrowser()
      await vi.runAllTimersAsync()
      await p
    })

    await togglePromise

    expect(result.current.dialogState).toBe('not_installed')
    expect(result.current.dialogOpen).toBe(true)
    expect(result.current.isLoading).toBe(false)
  })

  it('handleCancel: stops connection loop and deactivates server', async () => {
    vi.useFakeTimers()
    let checkCalled = false
    mockCheckConnected.mockImplementation(async () => {
      checkCalled = true
      return false
    })

    const { result } = renderHook(() => useJanBrowserExtension())

    let p: Promise<void>
    act(() => {
      p = result.current.toggleBrowser()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(checkCalled).toBe(true)

    await act(async () => {
      result.current.handleCancel()
      await vi.runAllTimersAsync()
    })

    await act(async () => {
      await p
    })

    expect(result.current.dialogOpen).toBe(false)
    expect(result.current.dialogState).toBe('closed')
    expect(result.current.isLoading).toBe(false)
    expect(mockDeactivate).toHaveBeenCalledWith(JAN_BROWSER_MCP_NAME)
  })

  it('does not crash on error when not cancelled', async () => {
    mockActivate.mockRejectedValue(new Error('crash'))
    const { result } = renderHook(() => useJanBrowserExtension())

    await act(async () => {
      await result.current.toggleBrowser()
    })

    expect(result.current.dialogOpen).toBe(false)
    expect(result.current.dialogState).toBe('closed')
    expect(result.current.isLoading).toBe(false)
  })

  it('cancel while the connector review is pending: activate still runs, then the run stops without opening the dialog', async () => {
    vi.useFakeTimers()
    let resolveReview: (val: boolean) => void
    mockEnsureConnectorReviewed.mockReturnValue(new Promise(res => resolveReview = res))

    const { result } = renderHook(() => useJanBrowserExtension())

    let togglePromise: Promise<void>
    act(() => {
      togglePromise = result.current.toggleBrowser()
    })

    act(() => {
      result.current.handleCancel()
    })

    await act(async () => {
      resolveReview(true)
      await togglePromise
    })

    expect(mockActivate).toHaveBeenCalledTimes(1)
    expect(mockDeactivate).toHaveBeenCalledWith(JAN_BROWSER_MCP_NAME)
    expect(mockEditServer).not.toHaveBeenCalledWith(JAN_BROWSER_MCP_NAME, expect.objectContaining({ active: true }))
    expect(result.current.dialogOpen).toBe(false)
    expect(result.current.dialogState).toBe('closed')
    // the finally block executes. However, handleCancel sets isCancelling to true
  })
})
