import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { selectPanelStatus, usePanelStatusPublisher, usePanelStatusMirror } from '../panelStatus'
import { useDownloadStore } from '@/hooks/useDownloadStore'

describe('status transport', () => {
  it('coalesces rapid status updates and stops publishing after unsubscribe', async () => {
    vi.useFakeTimers()
    const channels: { onmessage: ((event: MessageEvent) => void) | null; postMessage: (value: unknown) => void; close: () => void }[] = []
    const output: unknown[] = []
    class Channel {
      onmessage: ((event: MessageEvent) => void) | null = null
      constructor() { channels.push(this) }
      postMessage(value: unknown) { output.push(value) }
      close() {}
    }
    vi.stubGlobal('BroadcastChannel', Channel)
    const { unmount } = renderHook(() => usePanelStatusPublisher())
    act(() => channels[0].onmessage?.(new MessageEvent('message', { data: { type: 'subscribe' } })))
    expect(output).toHaveLength(1)
    act(() => {
      for (let index = 0; index < 30; index++) useAppState.getState().setActiveModels(['model-' + index])
    })
    expect(output).toHaveLength(1)
    act(() => vi.advanceTimersByTime(250))
    expect(output).toHaveLength(2)
    expect(output[1]).toMatchObject({ app: { activeModels: ['model-29'] } })
    act(() => channels[0].onmessage?.(new MessageEvent('message', { data: { type: 'unsubscribe' } })))
    act(() => { useAppState.getState().setActiveModels(['should-not-send']); vi.advanceTimersByTime(1000) })
    expect(output).toHaveLength(2)
    unmount()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
})

import { useAppState } from '@/hooks/useAppState'
import { useHardware } from '@/hooks/useHardware'

describe('read-only workspace status', () => {
  it('forwards measurements without copying private application state', () => {
    useAppState.setState({
      activeModels: ['local-model'], loadingModel: false,
      errorMessage: { subtitle: 'private content' },
      tokenSpeed: { message: 'private-message-id', tokenSpeed: 32, tokenCount: 64, lastTimestamp: 1 },
    })
    const snapshot = selectPanelStatus()
    expect(snapshot.app.activeModels).toEqual(['local-model'])
    expect(snapshot.app.tokenSpeed?.tokenSpeed).toBe(32)
    expect(JSON.stringify(snapshot)).not.toContain('private')
    expect(snapshot.hardware.hardwareData).toEqual(useHardware.getState().hardwareData)
    expect(Object.keys(snapshot.app).sort()).toEqual(['activeModels', 'loadingModel', 'serverStatus', 'tokenSpeed', 'tools'])
  })
})

describe('standalone measurements', () => {
  it('projects live server and download measurements without resume credentials', () => {
    useAppState.setState({ serverStatus: 'running' })
    useDownloadStore.getState().updateProgress('model', 0.5, 'Example model', 50, 100)
    useDownloadStore.getState().setResumeParams('model', { modelPath: 'path', hfToken: 'secret-download-token' })
    const snapshot = selectPanelStatus()
    expect(snapshot.app.serverStatus).toBe('running')
    expect(snapshot.downloads.downloads.model.current).toBe(50)
    expect(JSON.stringify(snapshot)).not.toContain('secret-download-token')
  })
  it('re-subscribes after a publisher restart and marks stale status unavailable', () => {
    vi.useFakeTimers()
    const sent: unknown[] = []
    let receive: ((event: MessageEvent) => void) | null = null
    class Channel {
      set onmessage(handler: (event: MessageEvent) => void) { receive = handler }
      postMessage(value: unknown) { sent.push(value) }
      close() {}
    }
    vi.stubGlobal('BroadcastChannel', Channel)
    const view = renderHook(() => usePanelStatusMirror())
    act(() => receive?.(new MessageEvent('message', { data: selectPanelStatus() })))
    expect(view.result.current).toBe(true)
    act(() => vi.advanceTimersByTime(7000))
    expect(sent.filter((value) => (value as { type: string }).type === 'subscribe').length).toBeGreaterThan(1)
    expect(view.result.current).toBe(false)
    act(() => receive?.(new MessageEvent('message', { data: selectPanelStatus() })))
    expect(view.result.current).toBe(true)
    view.unmount(); vi.unstubAllGlobals(); vi.useRealTimers()
  })
})
