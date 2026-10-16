import { useEffect, useState } from 'react'
import { useAppState } from '@/hooks/useAppState'
import { useHardware } from '@/hooks/useHardware'
import { useDownloadStore } from '@/hooks/useDownloadStore'

const CHANNEL = 'radium-panel-status-v1'

/** Explicit metadata projection: never send conversation content, callbacks, errors or provider secrets. */
export function selectPanelStatus() {
  const app = useAppState.getState()
  const hardware = useHardware.getState()
  const queue = useDownloadStore.getState()
  return {
    type: 'snapshot' as const,
    app: {
      activeModels: app.activeModels, loadingModel: app.loadingModel,
      serverStatus: app.serverStatus,
      tools: app.tools.map(({ name, server }) => ({ name, server, description: '', inputSchema: {} })),
      tokenSpeed: app.tokenSpeed ? {
        tokenSpeed: app.tokenSpeed.tokenSpeed, tokenCount: app.tokenSpeed.tokenCount,
        lastTimestamp: app.tokenSpeed.lastTimestamp, message: '',
      } : undefined,
    },
    hardware: {
      hardwareData: hardware.hardwareData, hardwareReady: hardware.hardwareReady, systemUsage: hardware.systemUsage,
    },
    downloads: {
      downloads: Object.fromEntries(Object.entries(queue.downloads).map(([id, value]) => [id, {
        id, name: value.name, progress: value.progress, current: value.current, total: value.total,
        speed: value.speed ? { bytesPerSecond: value.speed.bytesPerSecond, atBytes: value.speed.atBytes, atTime: value.speed.atTime }
          : { bytesPerSecond: 0, atBytes: value.current, atTime: 0 },
      }])),
      paused: [...queue.pausedDownloads],
    },
  }
}

/** Main window publishes only while the workspace subscribes; it adds no polling or model startup. */
export function usePanelStatusPublisher() {
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(CHANNEL)
    let stops: (() => void)[] = []
    let pending: ReturnType<typeof setTimeout> | undefined
    let expiry: ReturnType<typeof setTimeout> | undefined
    const stop = () => {
      stops.forEach((fn) => fn()); stops = []
      clearTimeout(pending); pending = undefined
      clearTimeout(expiry); expiry = undefined
    }
    const send = () => channel.postMessage(selectPanelStatus())
    const schedule = () => {
      if (pending) return
      pending = setTimeout(() => { pending = undefined; send() }, 250)
    }
    channel.onmessage = (event: MessageEvent) => {
      if (event.data?.type === 'subscribe') {
        if (stops.length === 0) stops = [useAppState.subscribe(schedule), useHardware.subscribe(schedule), useDownloadStore.subscribe(schedule)]
        clearTimeout(expiry)
        expiry = setTimeout(stop, 6500)
        send()
      } else if (event.data?.type === 'unsubscribe') stop()
    }
    return () => { stop(); channel.close() }
  }, [])
}

/** Mirror read-only measurements. This channel never forwards a command to the main window. */
export function usePanelStatusMirror() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(CHANNEL)
    let lastSeen = 0
    channel.onmessage = (event: MessageEvent<ReturnType<typeof selectPanelStatus>>) => {
      const value = event.data
      if (value?.type !== 'snapshot' || !Array.isArray(value.app?.activeModels) || !value.hardware?.hardwareData || !value.downloads || !Array.isArray(value.downloads.paused)) return
      useAppState.setState({
        activeModels: value.app.activeModels.filter((id) => typeof id === 'string'),
        loadingModel: value.app.loadingModel === true,
        serverStatus: value.app.serverStatus,
        tools: value.app.tools,
        tokenSpeed: value.app.tokenSpeed ? {
          tokenSpeed: value.app.tokenSpeed.tokenSpeed, tokenCount: value.app.tokenSpeed.tokenCount,
          lastTimestamp: value.app.tokenSpeed.lastTimestamp, message: '',
        } : undefined,
      })
      useHardware.setState({
        hardwareData: value.hardware.hardwareData,
        hardwareReady: value.hardware.hardwareReady === true,
        systemUsage: value.hardware.systemUsage,
      })
      useDownloadStore.setState({ downloads: value.downloads.downloads, pausedDownloads: new Set(value.downloads.paused) })
      lastSeen = Date.now()
      setReady(true)
    }
    channel.postMessage({ type: 'subscribe' })
    const reconnect = setInterval(() => {
      if (Date.now() - lastSeen >= 6000) setReady(false)
      channel.postMessage({ type: 'subscribe' })
    }, 2000)
    const unsubscribe = () => channel.postMessage({ type: 'unsubscribe' })
    window.addEventListener('pagehide', unsubscribe)
    return () => { clearInterval(reconnect); window.removeEventListener('pagehide', unsubscribe); unsubscribe(); channel.close() }
  }, [])
  return ready
}
