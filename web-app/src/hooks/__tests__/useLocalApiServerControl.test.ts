import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'

import { useAppState } from '@/hooks/useAppState'
import { useLocalApiServer } from '@/hooks/useLocalApiServer'
import { useModelProvider } from '@/hooks/useModelProvider'
import { useLocalApiServerControl } from '@/hooks/useLocalApiServerControl'
import * as activeModelsSync from '@/utils/activeModelsSync'
import * as ensureModelForServer from '@/utils/ensureModelForServer'
import * as localApiServerControl from '@/utils/localApiServerControl'
import { useServiceHub } from '@/hooks/useServiceHub'
import { MODEL_LOAD_WATCHDOG_MS } from '@/lib/utils'

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}))

vi.mock('@/hooks/useServiceHub', () => ({
  useServiceHub: vi.fn(),
}))

vi.mock('@/utils/activeModelsSync', () => ({
  hydrateActiveModelsForRunningServer: vi.fn(),
  syncActiveModelsFromEngines: vi.fn(),
}))

vi.mock('@/utils/ensureModelForServer', () => ({
  ensureModelForServer: vi.fn(),
}))

vi.mock('@/utils/localApiServerControl', () => ({
  setLocalApiServerRunning: vi.fn(),
  stopLocalApiServer: vi.fn(),
}))

describe('useLocalApiServerControl', () => {
  const { hydrateActiveModelsForRunningServer, syncActiveModelsFromEngines } =
    vi.mocked(activeModelsSync)
  const { ensureModelForServer: mockEnsureModelForServer } =
    vi.mocked(ensureModelForServer)
  const { setLocalApiServerRunning } =
    vi.mocked(localApiServerControl)

  let mockAppService: { getServerStatus: ReturnType<typeof vi.fn> }
  let mockModelsService: { getActiveModels: ReturnType<typeof vi.fn> }
  let mockServiceHub: any
  let focusHandler: EventListener

  beforeEach(() => {
    vi.useFakeTimers()

    mockAppService = {
      getServerStatus: vi.fn().mockResolvedValue(true),
    }

    mockModelsService = {
      getActiveModels: vi.fn().mockResolvedValue([]),
    }

    mockServiceHub = {
      app: () => mockAppService,
      models: () => mockModelsService,
    }

    vi.mocked(useServiceHub).mockReturnValue(mockServiceHub)

    useAppState.setState({ serverStatus: 'stopped' })
    useLocalApiServer.setState({
      defaultModelLocalApiServer: null,
      lastServerModels: [],
      serverPort: 1337,
    })
    useModelProvider.setState({ providers: [] })

    vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'focus') {
        focusHandler = handler as EventListener
      }
    })
    vi.spyOn(window, 'removeEventListener')
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // To fix react 'act' warning cleanly:
  const renderHookAndFlush = async () => {
    let result: any
    let unmount: any
    await act(async () => {
      const render = renderHook(() => useLocalApiServerControl())
      result = render.result
      unmount = render.unmount
      await Promise.resolve()
      vi.runAllTimers()
    })
    return { result, unmount }
  }

  describe('refreshStatus', () => {
    it('sets status to running and hydrates models if server is running', async () => {
      mockAppService.getServerStatus.mockResolvedValue(true)
      const { result } = await renderHookAndFlush()

      mockAppService.getServerStatus.mockClear()
      vi.mocked(hydrateActiveModelsForRunningServer).mockClear()

      await act(async () => {
        const p = result.current.refreshStatus()
        await Promise.resolve()
        vi.runAllTimers()
        await p
      })

      expect(useAppState.getState().serverStatus).toBe('running')
      expect(hydrateActiveModelsForRunningServer).toHaveBeenCalledWith(mockModelsService)
    })

    it('does nothing if server is not running', async () => {
      mockAppService.getServerStatus.mockResolvedValue(false)
      const { result } = await renderHookAndFlush()

      await act(async () => {
        useAppState.setState({ serverStatus: 'stopped' })
      })

      mockAppService.getServerStatus.mockClear()
      vi.mocked(hydrateActiveModelsForRunningServer).mockClear()

      await act(async () => {
        const p = result.current.refreshStatus()
        await Promise.resolve()
        vi.runAllTimers()
        await p
      })

      expect(useAppState.getState().serverStatus).toBe('stopped')
      expect(hydrateActiveModelsForRunningServer).not.toHaveBeenCalled()
    })

    it('logs error if checking status fails', async () => {
      const error = new Error('Network error')
      const { result } = await renderHookAndFlush()

      mockAppService.getServerStatus.mockRejectedValue(error)
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      consoleErrorSpy.mockClear()

      await act(async () => {
        const p = result.current.refreshStatus()
        await Promise.resolve()
        vi.runAllTimers()
        await p
      })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to check server status:',
        error
      )
      consoleErrorSpy.mockRestore()
    })
  })

  describe('window focus listener', () => {
    it('calls refreshStatus on window focus', async () => {
      mockAppService.getServerStatus.mockResolvedValue(false)
      const { unmount } = await renderHookAndFlush()

      mockAppService.getServerStatus.mockClear()

      await act(async () => {
        focusHandler(new Event('focus'))
        await Promise.resolve()
        vi.runAllTimers()
        await Promise.resolve()
      })

      expect(mockAppService.getServerStatus).toHaveBeenCalled()

      unmount()

      expect(window.removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function))
    })
  })

  describe('start', () => {
    it('shows info toast and sets status to pending', async () => {
      mockEnsureModelForServer.mockResolvedValue({
        status: 'loaded',
        modelId: 'test-model',
        providerName: 'test-provider',
      })
      const { result } = await renderHookAndFlush()

      let startPromise: Promise<void>
      act(() => {
        startPromise = result.current.start()
      })

      expect(toast.info).toHaveBeenCalledWith('Starting server...', {
        description: 'Attempting to start server on port 1337',
      })
      expect(useAppState.getState().serverStatus).toBe('pending')

      await act(async () => {
        await startPromise
      })
    })

    it('calls ensureModelForServer with correct params if ensureModel is true', async () => {
      useLocalApiServer.setState({
        defaultModelLocalApiServer: { model: 'm1', provider: 'p1' },
      })
      mockEnsureModelForServer.mockResolvedValue({
        status: 'loaded',
        modelId: 'm1',
        providerName: 'p1',
      })
      const { result } = await renderHookAndFlush()

      await act(async () => {
        await result.current.start()
      })

      const callArgs = mockEnsureModelForServer.mock.calls[0][0]
      expect(callArgs.modelOverride).toEqual({ model: 'm1', provider: 'p1' })
      expect(callArgs.modelsService).toBeDefined()
      expect(callArgs.onLoadStart).toBeTypeOf('function')
      expect(callArgs.onLoadEnd).toBeTypeOf('function')
    })

    it('updates isModelLoading state via onLoadStart and onLoadEnd', async () => {
      let triggerStart: () => void = () => {}
      let triggerEnd: () => void = () => {}
      mockEnsureModelForServer.mockImplementation(async ({ onLoadStart, onLoadEnd }) => {
        triggerStart = onLoadStart as () => void
        triggerEnd = onLoadEnd as () => void
        return { status: 'loaded', modelId: 'm1', providerName: 'p1' }
      })

      const { result } = await renderHookAndFlush()

      let startPromise: Promise<void>
      act(() => {
        startPromise = result.current.start()
      })

      act(() => {
        triggerStart()
      })
      expect(result.current.isModelLoading).toBe(true)

      act(() => {
        triggerEnd()
      })
      expect(result.current.isModelLoading).toBe(false)

      await act(async () => {
        await startPromise
      })
    })

    it('throws and dismisses toast if no model is available', async () => {
      mockEnsureModelForServer.mockResolvedValue({ status: 'no_model_available' })
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = await renderHookAndFlush()

      await act(async () => {
        await result.current.start()
      })

      expect(toast.dismiss).toHaveBeenCalled()
      expect(toast.error).toHaveBeenCalledWith('Failed to start model', {
        description: 'No model available to load',
      })
      consoleErrorSpy.mockRestore()
    })

    it('sets lastServerModels and syncs models if active models exist', async () => {
      mockEnsureModelForServer.mockResolvedValue({
        status: 'loaded',
        modelId: 'm1',
        providerName: 'p1',
      })
      mockModelsService.getActiveModels.mockResolvedValue(['m1'])

      const allProviders = [
        {
          provider: 'p1',
          models: [{ id: 'm1' }],
        } as any,
      ]
      useModelProvider.setState({ providers: allProviders })

      const { result } = await renderHookAndFlush()

      await act(async () => {
        await result.current.start()
      })

      expect(useLocalApiServer.getState().lastServerModels).toStrictEqual([
        { model: 'm1', provider: 'p1' },
      ])
      expect(syncActiveModelsFromEngines).toHaveBeenCalledWith(['m1'])
      expect(setLocalApiServerRunning).toHaveBeenCalledWith(true)
    })

    it('sets lastServerModels gracefully if no models returned', async () => {
      mockEnsureModelForServer.mockResolvedValue({
        status: 'loaded',
        modelId: 'm1',
        providerName: 'p1',
      })
      mockModelsService.getActiveModels.mockResolvedValue(null)

      const { result } = await renderHookAndFlush()

      await act(async () => {
        await result.current.start()
      })

      expect(useLocalApiServer.getState().lastServerModels).toStrictEqual([])
      expect(syncActiveModelsFromEngines).toHaveBeenCalledWith([])
      expect(setLocalApiServerRunning).toHaveBeenCalledWith(true)
    })

    it('bypasses model ensure if ensureModel is false', async () => {
      const { result } = await renderHookAndFlush()

      await act(async () => {
        await result.current.start({ ensureModel: false })
      })

      expect(mockEnsureModelForServer).not.toHaveBeenCalled()
      expect(setLocalApiServerRunning).toHaveBeenCalledWith(true)
    })

    it('handles "Address already in use" error correctly', async () => {
      mockEnsureModelForServer.mockResolvedValue({
        status: 'loaded',
        modelId: 'm1',
        providerName: 'p1',
      })

      // Stop the error from cascading down and failing the test unexpectedly if it rejects during cleanup
      setLocalApiServerRunning.mockImplementation(async (running) => {
        if (running) throw new Error('Address already in use')
      })

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = await renderHookAndFlush()

      await act(async () => {
        await result.current.start()
      })

      expect(toast.error).toHaveBeenCalledWith('Port has been occupied', {
        description: 'Port 1337 is already in use. Please try a different port.',
      })
      consoleErrorSpy.mockRestore()
    })

    it('handles "Invalid or inaccessible model path" error correctly', async () => {
      mockEnsureModelForServer.mockRejectedValue(
        new Error('Invalid or inaccessible model path: /fake/path')
      )
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = await renderHookAndFlush()

      await act(async () => {
        await result.current.start()
      })

      expect(toast.error).toHaveBeenCalledWith('Invalid or inaccessible model path', {
        description: 'Invalid or inaccessible model path: /fake/path',
      })
      consoleErrorSpy.mockRestore()
    })

    it('handles general "model" related error correctly', async () => {
      mockEnsureModelForServer.mockRejectedValue(new Error('failed to load model weights'))
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = await renderHookAndFlush()

      await act(async () => {
        await result.current.start()
      })

      expect(toast.error).toHaveBeenCalledWith('Failed to start model', {
        description: 'failed to load model weights',
      })
      consoleErrorSpy.mockRestore()
    })

    it('handles general fallback error correctly', async () => {
      mockEnsureModelForServer.mockRejectedValue(new Error('general fallback'))
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = await renderHookAndFlush()

      await act(async () => {
        await result.current.start()
      })

      expect(toast.error).toHaveBeenCalledWith('Failed to start server', {
        description: 'general fallback',
      })
      consoleErrorSpy.mockRestore()
    })

    it('times out waiting for model to load if takes too long', async () => {
      mockEnsureModelForServer.mockImplementation(() => {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            const err = new Error('Timed out waiting for the model to finish loading.')
            reject(err)
          }, MODEL_LOAD_WATCHDOG_MS + 1000)
        })
      })
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = await renderHookAndFlush()

      let startPromise: Promise<void>
      act(() => {
        startPromise = result.current.start()
      })

      act(() => {
        vi.advanceTimersByTime(MODEL_LOAD_WATCHDOG_MS + 1001)
      })

      await act(async () => {
        await startPromise
      })

      expect(toast.error).toHaveBeenCalledWith('Failed to start model', {
        description: 'Timed out waiting for the model to finish loading.',
      })
      consoleErrorSpy.mockRestore()
    })
  })

  describe('stop', () => {
    it('calls setLocalApiServerRunning with false', async () => {
      const { result } = await renderHookAndFlush()

      await act(async () => {
        await result.current.stop()
      })

      expect(setLocalApiServerRunning).toHaveBeenCalledWith(false)
    })

    it('logs error if stopping fails', async () => {
      const error = new Error('Stop failed')
      setLocalApiServerRunning.mockImplementation(async (running) => {
        if (!running) throw error
      })
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = await renderHookAndFlush()

      await act(async () => {
        await result.current.stop()
      })

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error stopping server:', error)
      consoleErrorSpy.mockRestore()
    })
  })

  describe('toggle', () => {
    it('starts server if stopped', async () => {
      mockAppService.getServerStatus.mockResolvedValue(false)

      const { result } = await renderHookAndFlush()
      await act(async () => {
        useAppState.setState({ serverStatus: 'stopped' })
      })

      mockEnsureModelForServer.mockResolvedValue({
        status: 'loaded',
        modelId: 'm1',
        providerName: 'p1',
      })
      setLocalApiServerRunning.mockClear()

      let togglePromise: Promise<void>
      act(() => {
        togglePromise = result.current.toggle()
      })

      await act(async () => {
        await togglePromise
      })

      expect(setLocalApiServerRunning).toHaveBeenCalledWith(true)
    })

    it('stops server if running', async () => {
      const { result } = await renderHookAndFlush()

      await act(async () => {
        useAppState.setState({ serverStatus: 'running' })
      })
      setLocalApiServerRunning.mockClear()

      // Prevent mock error bubble up from the stop call to setLocalApiServerRunning(false) from cascading failure to terminal logging
      setLocalApiServerRunning.mockImplementation(async () => {})

      await act(async () => {
        await result.current.toggle()
      })

      expect(setLocalApiServerRunning).toHaveBeenCalledWith(false)
    })
  })

  describe('returns correct status flags', () => {
    it('reports isRunning when running', async () => {
      const { result } = await renderHookAndFlush()
      await act(async () => {
        useAppState.setState({ serverStatus: 'running' })
      })

      expect(result.current.isRunning).toBe(true)
      expect(result.current.isBusy).toBe(false)
    })

    it('reports isRunning when pending', async () => {
      mockAppService.getServerStatus.mockImplementation(() => new Promise(() => {}))
      const { result } = await renderHookAndFlush()
      await act(async () => {
        useAppState.setState({ serverStatus: 'pending' })
      })

      expect(result.current.isRunning).toBe(true)
      expect(result.current.isBusy).toBe(true)
    })

    it('reports not isRunning when stopped', async () => {
      mockAppService.getServerStatus.mockImplementation(() => new Promise(() => {}))
      const { result } = await renderHookAndFlush()
      await act(async () => {
        useAppState.setState({ serverStatus: 'stopped' })
      })

      expect(result.current.isRunning).toBe(false)
      expect(result.current.isBusy).toBe(false)
    })
  })
})
