import { afterEach, expect, it, vi } from 'vitest'
import { captureAnnotation, readAnnotationPng } from './production-log'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
function display() {
  const stop = vi.fn()
  const stream = { getTracks: () => [{ stop }] }
  vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(stream) } })
  return stop
}

it('freezes a screenshot and releases all capture tracks immediately', async () => {
  const stop = display()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2)
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(100)
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(50)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,cGl4ZWxz')
  const result = await captureAnnotation()
  expect(result.dataUrl).toBe('data:image/png;base64,cGl4ZWxz')
  expect(Number.isFinite(Date.parse(result.capturedAt!))).toBe(true)
  expect(stop).toHaveBeenCalledOnce()
})

it('stops capture even if video playback fails', async () => {
  const stop = display()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('Playback failed'))
  await expect(captureAnnotation()).rejects.toThrow('Playback failed')
  expect(stop).toHaveBeenCalledOnce()
})

it('gives an actionable fallback when the host has no display capture', async () => {
  vi.stubGlobal('navigator', {})
  await expect(captureAnnotation()).rejects.toThrow('Paste a screenshot or attach a PNG')
})

it('stops capture if playback never produces a frame', async () => {
  vi.useFakeTimers()
  const stop = display()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockReturnValue(new Promise(() => {}))
  const pending = expect(captureAnnotation()).rejects.toThrow('No screenshot frame arrived')
  await vi.advanceTimersByTimeAsync(10000)
  await pending
  expect(stop).toHaveBeenCalledOnce()
})

it('does not invent an original capture time for attached PNG images', async () => {
  const result = await readAnnotationPng(new File(['pixels'], 'screenshot.png', { type: 'image/png' }))
  expect(result.capturedAt).toBeNull()
  expect(result.dataUrl).toMatch(/^data:image\/png;base64,/)
  await expect(readAnnotationPng(new File(['x'], 'document.txt', { type: 'text/plain' }))).rejects.toThrow('PNG')
})
