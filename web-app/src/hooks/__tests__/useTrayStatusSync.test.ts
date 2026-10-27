import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(),
  }
})

vi.mock('@tauri-apps/api/event', () => {
  return {
    listen: vi.fn(),
  }
})

vi.mock('@/utils/localApiServerControl', () => {
  return {
    setLocalApiServerRunning: vi.fn().mockResolvedValue(undefined),
  }
})

import { useTrayStatusSync } from '../useTrayStatusSync'
import { useAppState } from '@/hooks/useAppState'
import { useLocalApiServer } from '@/hooks/useLocalApiServer'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { setLocalApiServerRunning } from '@/utils/localApiServerControl'

describe('useTrayStatusSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()

    useAppState.setState({
      serverStatus: 'stopped',
      activeModels: [],
    })

    useLocalApiServer.setState({
      serverPort: 1337,
      apiPrefix: '/v1',
    })

    vi.stubGlobal('IS_TAURI', true)
    vi.stubGlobal('IS_MACOS', true)
    vi.stubGlobal('IS_WINDOWS', false)
    vi.stubGlobal('IS_DEV', false)

    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'plugin:hardware|get_system_usage') {
        return { cpu: 0, used_memory: 1024, total_memory: 8192 }
      }
      if (cmd === 'plugin:mlx|get_mlx_all_sessions') {
        return []
      }
      return undefined
    })

    vi.mocked(listen).mockImplementation(async () => {
      return () => {}
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('bails early on non-Tauri platforms', async () => {
    vi.stubGlobal('IS_TAURI', false)
    renderHook(() => useTrayStatusSync())

    await act(async () => {
      vi.runAllTimers()
    })

    const invocations = vi.mocked(invoke).mock.calls.filter(call => call[0] === 'update_tray_status')
    expect(invocations).toStrictEqual([])
  })

  it('bails early on Linux', async () => {
    vi.stubGlobal('IS_MACOS', false)
    vi.stubGlobal('IS_WINDOWS', false)
    renderHook(() => useTrayStatusSync())

    await act(async () => {
      vi.runAllTimers()
    })

    const invocations = vi.mocked(invoke).mock.calls.filter(call => call[0] === 'update_tray_status')
    expect(invocations).toStrictEqual([])
  })

  it('sends correct initial payload and updates memory on interval', async () => {
    useAppState.setState({ serverStatus: 'running' })
    useLocalApiServer.setState({ serverPort: 8080, apiPrefix: '/api' })

    const { unmount } = renderHook(() => useTrayStatusSync())

    await act(async () => {
      // Allow initial push to finish
      await Promise.resolve()
    })

    const firstCalls = vi.mocked(invoke).mock.calls.filter(call => call[0] === 'update_tray_status')
    expect(firstCalls.length).toBe(1)
    expect(firstCalls[0][1]).toStrictEqual({
      payload: {
        server_running: true,
        server_url: 'http://127.0.0.1:8080/api',
        model_label: '',
        ram_used_mb: 1024,
        ram_total_mb: 8192,
        ram_percent: 13, // 1024/8192 = 0.125 -> 13% round
      }
    })

    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'plugin:hardware|get_system_usage') {
        return { cpu: 0, used_memory: 2048, total_memory: 8192 }
      }
      if (cmd === 'plugin:mlx|get_mlx_all_sessions') {
        return []
      }
      return undefined
    })

    await act(async () => {
      vi.advanceTimersByTime(5000)
      await Promise.resolve()
    })

    const calls = vi.mocked(invoke).mock.calls.filter(call => call[0] === 'update_tray_status')
    expect(calls.length).toBe(2)
    expect(calls[1][1]).toStrictEqual({
      payload: {
        server_running: true,
        server_url: 'http://127.0.0.1:8080/api',
        model_label: '',
        ram_used_mb: 2048,
        ram_total_mb: 8192,
        ram_percent: 25,
      }
    })

    unmount()

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    const afterUnmountCalls = vi.mocked(invoke).mock.calls.filter(call => call[0] === 'update_tray_status')
    expect(afterUnmountCalls.length).toBe(2)
  })

  it('calculates model_label based on mlx sessions', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'plugin:hardware|get_system_usage') {
        return { cpu: 0, used_memory: 1024, total_memory: 8192 }
      }
      if (cmd === 'plugin:mlx|get_mlx_all_sessions') {
        return [
          { is_embedding: false, model_id: 'llama-2' },
          { is_embedding: true, model_id: 'nomic-embed' }
        ]
      }
      return undefined
    })

    renderHook(() => useTrayStatusSync())

    await act(async () => {
      await Promise.resolve()
    })

    const calls = vi.mocked(invoke).mock.calls.filter(call => call[0] === 'update_tray_status')
    expect(calls[0][1]).toStrictEqual({
      payload: {
        server_running: false,
        server_url: 'http://127.0.0.1:1337/v1',
        model_label: 'llama-2',
        ram_used_mb: 1024,
        ram_total_mb: 8192,
        ram_percent: 13,
      }
    })
  })

  it('calculates model_label with multiple mlx non-embedding sessions', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'plugin:hardware|get_system_usage') {
        return { cpu: 0, used_memory: 1024, total_memory: 8192 }
      }
      if (cmd === 'plugin:mlx|get_mlx_all_sessions') {
        return [
          { is_embedding: false, model_id: 'llama-2' },
          { is_embedding: false, model_id: 'llama-3' }
        ]
      }
      return undefined
    })

    renderHook(() => useTrayStatusSync())

    await act(async () => {
      await Promise.resolve()
    })

    const calls = vi.mocked(invoke).mock.calls.filter(call => call[0] === 'update_tray_status')
    expect(calls[0][1]?.payload?.model_label).toBe('2 models loaded')
  })

  it('calculates model_label falling back to single activeModel', async () => {
    useAppState.setState({ activeModels: ['gpt-4'] })

    renderHook(() => useTrayStatusSync())

    await act(async () => {
      await Promise.resolve()
    })

    const calls = vi.mocked(invoke).mock.calls.filter(call => call[0] === 'update_tray_status')
    expect(calls[0][1]?.payload?.model_label).toBe('gpt-4')
  })

  it('calculates model_label falling back to multiple activeModels', async () => {
    useAppState.setState({ activeModels: ['gpt-4', 'gpt-3'] })

    renderHook(() => useTrayStatusSync())

    await act(async () => {
      await Promise.resolve()
    })

    const calls = vi.mocked(invoke).mock.calls.filter(call => call[0] === 'update_tray_status')
    expect(calls[0][1]?.payload?.model_label).toBe('2 models loaded')
  })

  it('handles 0 total memory correctly', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'plugin:hardware|get_system_usage') {
        return { cpu: 0, used_memory: 0, total_memory: 0 }
      }
      if (cmd === 'plugin:mlx|get_mlx_all_sessions') {
        return []
      }
      return undefined
    })

    renderHook(() => useTrayStatusSync())

    await act(async () => {
      await Promise.resolve()
    })

    const calls = vi.mocked(invoke).mock.calls.filter(call => call[0] === 'update_tray_status')
    expect(calls[0][1]?.payload?.ram_percent).toBe(0)
  })

  it('handles failed system usage or mlx session calls gracefully', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'plugin:hardware|get_system_usage' || cmd === 'plugin:mlx|get_mlx_all_sessions') {
        throw new Error('IPC failed')
      }
      return undefined
    })

    renderHook(() => useTrayStatusSync())

    await act(async () => {
      await Promise.resolve()
    })

    const calls = vi.mocked(invoke).mock.calls.filter(call => call[0] === 'update_tray_status')
    expect(calls[0][1]).toStrictEqual({
      payload: {
        server_running: false,
        server_url: 'http://127.0.0.1:1337/v1',
        model_label: '',
        ram_used_mb: 0,
        ram_total_mb: 0,
        ram_percent: 0,
      }
    })
  })

  it('listens for tray server start and stop events', async () => {
    // Verifies tray events are wired to setLocalApiServerRunning and unlistened on unmount.
    const unlistenStop = vi.fn()
    const unlistenStart = vi.fn()

    let stopCallback: () => void = () => {}
    let startCallback: () => void = () => {}

    vi.mocked(listen).mockImplementation(async (event, cb) => {
      if (event === 'tray-stop-server') {
        stopCallback = cb as () => void
        return unlistenStop
      }
      if (event === 'tray-start-server') {
        startCallback = cb as () => void
        return unlistenStart
      }
      return () => {}
    })

    const { unmount } = renderHook(() => useTrayStatusSync())

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve() // Need extra tick for promises to resolve
    })

    act(() => {
      stopCallback()
    })
    act(() => {
      startCallback()
    })

    expect(vi.mocked(setLocalApiServerRunning).mock.calls).toStrictEqual([[false], [true]])

    const initialUnlistenStopCount = unlistenStop.mock.calls.length
    const initialUnlistenStartCount = unlistenStart.mock.calls.length
    unmount()
    expect(unlistenStop.mock.calls.length).toBe(initialUnlistenStopCount + 1)
    expect(unlistenStart.mock.calls.length).toBe(initialUnlistenStartCount + 1)
  })
})
