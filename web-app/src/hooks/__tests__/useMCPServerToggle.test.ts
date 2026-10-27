import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useConnectorReview } from '@/hooks/useConnectorReview'
import { useMCPServers, type MCPServerConfig } from '@/hooks/useMCPServers'
import { useMCPServerToggle } from '@/hooks/useMCPServerToggle'
import { useServiceHub } from '@/hooks/useServiceHub'
import { useTranslation } from '@/i18n/react-i18next-compat'

// --- Mocking External Boundaries ---

const { mockConnectorNeedsReview, mockApproveConnector, mockActivateMCPServer, mockDeactivateMCPServer, mockToastError } =
  vi.hoisted(() => {
    return {
      mockConnectorNeedsReview: vi.fn(),
      mockApproveConnector: vi.fn(),
      mockActivateMCPServer: vi.fn(),
      mockDeactivateMCPServer: vi.fn(),
      mockToastError: vi.fn(),
    }
  })

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
  },
}))

vi.mock('@/hooks/useServiceHub', () => {
  const mcpMock = {
    connectorNeedsReview: mockConnectorNeedsReview,
    approveConnector: mockApproveConnector,
    activateMCPServer: mockActivateMCPServer,
    deactivateMCPServer: mockDeactivateMCPServer,
  }
  return {
    useServiceHub: vi.fn(() => ({ mcp: () => mcpMock })),
  }
})

vi.mock('@/i18n/react-i18next-compat', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('useMCPServerToggle', () => {
  beforeEach(() => {
    // Reset Zustand stores
    useMCPServers.setState({ mcpServers: {}, deletedServerKeys: [] })
    useConnectorReview.setState({ pending: [] })
    // Reset mocks
    vi.clearAllMocks()

    // Default implementations
    mockConnectorNeedsReview.mockResolvedValue(false)
    mockApproveConnector.mockResolvedValue(undefined)
    mockActivateMCPServer.mockResolvedValue(undefined)
    mockDeactivateMCPServer.mockResolvedValue(undefined)

    // Stub syncServers to not try to hit real service hub
    useMCPServers.setState({
      syncServers: vi.fn().mockResolvedValue(undefined),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('activates server successfully when review is not needed', async () => {
    const config: MCPServerConfig = { command: 'test', args: [], env: {} }
    useMCPServers.setState({ mcpServers: { 'server1': config } })

    const { result } = renderHook(() => useMCPServerToggle())

    await act(async () => {
      await result.current.toggleServer('server1', config, true)
    })

    expect(mockConnectorNeedsReview).toHaveBeenCalledWith('server1', config)
    expect(mockActivateMCPServer).toHaveBeenCalledWith('server1', { ...config, active: true })

    const state = useMCPServers.getState()
    expect(state.mcpServers['server1']).toStrictEqual({ ...config, active: true })
    expect(result.current.isServerPending('server1')).toBe(false)
  })

  it('activates server successfully when review is needed and allowed', async () => {
    mockConnectorNeedsReview.mockResolvedValue(true)
    const config: MCPServerConfig = { command: 'test', args: [], env: {} }
    useMCPServers.setState({ mcpServers: { 'server1': config } })

    const { result } = renderHook(() => useMCPServerToggle())

    // Start toggle, it will block on review
    let togglePromise: Promise<void>

    // We cannot use await act(...) because the promise blocks on the user input in Zustand store.
    // So we just call the function and let it run to the blocked state.
    act(() => {
      togglePromise = result.current.toggleServer('server1', config, true)
    })

    // Wait a tick for the microtasks to queue up and state to be updated in store
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Settle review to allowed
    await act(async () => {
      const pending = useConnectorReview.getState().pending
      expect(pending.length).toBe(1)
      useConnectorReview.getState().settle(pending[0].id, true)
      await togglePromise
    })

    expect(mockApproveConnector).toHaveBeenCalledWith('server1', config)
    expect(mockActivateMCPServer).toHaveBeenCalledWith('server1', { ...config, active: true })

    const state = useMCPServers.getState()
    expect(state.mcpServers['server1']).toStrictEqual({ ...config, active: true })
    expect(result.current.isServerPending('server1')).toBe(false)
  })

  it('does not activate server when review is needed and cancelled', async () => {
    mockConnectorNeedsReview.mockResolvedValue(true)
    const config: MCPServerConfig = { command: 'test', args: [], env: {} }
    useMCPServers.setState({ mcpServers: { 'server1': config } })

    const { result } = renderHook(() => useMCPServerToggle())

    let togglePromise: Promise<void>
    act(() => {
      togglePromise = result.current.toggleServer('server1', config, true)
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    await act(async () => {
      const pending = useConnectorReview.getState().pending
      expect(pending.length).toBe(1)
      useConnectorReview.getState().settle(pending[0].id, false)
      await togglePromise
    })

    expect(mockApproveConnector).not.toHaveBeenCalled()
    expect(mockActivateMCPServer).not.toHaveBeenCalled()

    const state = useMCPServers.getState()
    expect(state.mcpServers['server1']).toStrictEqual(config) // remains inactive
    expect(result.current.isServerPending('server1')).toBe(false)
  })

  it('deactivates server successfully', async () => {
    const config: MCPServerConfig = { command: 'test', args: [], env: {}, active: true }
    useMCPServers.setState({ mcpServers: { 'server1': config } })

    const { result } = renderHook(() => useMCPServerToggle())

    await act(async () => {
      await result.current.toggleServer('server1', config, false)
    })

    expect(mockDeactivateMCPServer).toHaveBeenCalledWith('server1')

    const state = useMCPServers.getState()
    expect(state.mcpServers['server1']).toStrictEqual({ ...config, active: false })
    expect(result.current.isServerPending('server1')).toBe(false)
  })

  it('handles activation failure by updating state to inactive and showing toast with Error instance', async () => {
    const error = new Error('Activation failed')
    mockActivateMCPServer.mockRejectedValue(error)
    const config: MCPServerConfig = { command: 'test', args: [], env: {} }
    useMCPServers.setState({ mcpServers: { 'server1': config } })

    const { result } = renderHook(() => useMCPServerToggle())

    await act(async () => {
      await result.current.toggleServer('server1', config, true)
    })

    expect(mockActivateMCPServer).toHaveBeenCalledWith('server1', { ...config, active: true })
    expect(mockToastError).toHaveBeenCalledWith('common:connectorsMenu.toggleFailed', {
      description: 'Activation failed',
    })

    const state = useMCPServers.getState()
    expect(state.mcpServers['server1']).toStrictEqual({ ...config, active: false })
    expect(result.current.isServerPending('server1')).toBe(false)
  })

  it('handles activation failure by updating state to inactive and showing toast with non-Error', async () => {
    mockActivateMCPServer.mockRejectedValue('String error')
    const config: MCPServerConfig = { command: 'test', args: [], env: {} }
    useMCPServers.setState({ mcpServers: { 'server1': config } })

    const { result } = renderHook(() => useMCPServerToggle())

    await act(async () => {
      await result.current.toggleServer('server1', config, true)
    })

    expect(mockToastError).toHaveBeenCalledWith('common:connectorsMenu.toggleFailed', {
      description: 'String error',
    })

    const state = useMCPServers.getState()
    expect(state.mcpServers['server1']).toStrictEqual({ ...config, active: false })
  })

  it('prevents concurrent toggles for the same server key', async () => {
    // Create a delayed activation to keep it pending
    let resolveActivation: (val: any) => void
    mockActivateMCPServer.mockImplementation(() => new Promise((resolve) => {
      resolveActivation = resolve
    }))

    const config: MCPServerConfig = { command: 'test', args: [], env: {} }

    const { result } = renderHook(() => useMCPServerToggle())

    let togglePromise1: Promise<void>
    act(() => {
      togglePromise1 = result.current.toggleServer('server1', config, true)
    })

    expect(result.current.isServerPending('server1')).toBe(true)

    // Call it again immediately
    await act(async () => {
      await result.current.toggleServer('server1', config, true)
    })

    // Should only have called activation once
    expect(mockActivateMCPServer).toHaveBeenCalledTimes(1)

    // Resolve the first one to cleanup
    await act(async () => {
      resolveActivation(undefined)
      await togglePromise1
    })
  })
})
