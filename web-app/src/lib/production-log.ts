import { getServiceHub } from '@/hooks/useServiceHub'

export type ProductionAnnotation = {
  id: string
  created_at: string
  note: string
  page_url: string
  screenshot: boolean
  captured_at: string | null
}
export type ProductionLogSnapshot = { folder: string; entries: ProductionAnnotation[] }
export type AnnotationImage = { dataUrl: string; capturedAt: string | null }

export const productionLog = {
  load: () => Promise.resolve().then(() => getServiceHub().core().invoke<ProductionLogSnapshot>('get_production_log')),
  chooseFolder: async () => {
    const next = await getServiceHub().core().invoke<ProductionLogSnapshot | null>('choose_production_log_folder')
    if (next) window.dispatchEvent(new Event('atomic-production-log-folder-changed'))
    return next
  },
  save: (folder: string, note: string, pageUrl: string, image: AnnotationImage | null) =>
    getServiceHub().core().invoke<ProductionAnnotation>('save_production_annotation', {
      expectedFolder: folder, note, pageUrl, screenshot: image?.dataUrl ?? null,
      capturedAt: image?.capturedAt ?? null,
    }),
  image: (folder: string, id: string, fullSize = false) =>
    getServiceHub().core().invoke<string>('production_annotation_image', {
      expectedFolder: folder, id, fullSize,
    }),
}

/** Freeze one user-selected display frame; never retain a live capture stream. */
export async function captureAnnotation(): Promise<AnnotationImage> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Screen capture is unavailable here. Paste a screenshot or attach a PNG instead.')
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
  const video = document.createElement('video')
  const bounded = <T,>(promise: Promise<T>) => new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('No screenshot frame arrived. Try again or paste a screenshot.')), 10000)
    promise.then(value => { window.clearTimeout(timeout); resolve(value) }, reason => { window.clearTimeout(timeout); reject(reason) })
  })
  try {
    video.muted = true
    video.srcObject = stream
    await bounded(video.play())
    // play() resolves when enough data exists for playback, before a frame is
    // necessarily painted. Wait for a decoded frame where the API is available.
    if (typeof video.requestVideoFrameCallback === 'function') {
      await bounded(new Promise<void>(resolve => { video.requestVideoFrameCallback(() => resolve()) }))
    } else if (video.readyState < 2) {
      await bounded(new Promise<void>((resolve, reject) => {
        video.addEventListener('loadeddata', () => resolve(), { once: true })
        video.addEventListener('error', () => reject(new Error('The selected screen could not be read')), { once: true })
      }))
    }
    if (!video.videoWidth || !video.videoHeight) throw new Error('The selected screen has no image. Try again.')
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare the screenshot')
    context.drawImage(video, 0, 0)
    return { dataUrl: canvas.toDataURL('image/png'), capturedAt: new Date().toISOString() }
  } finally {
    stream.getTracks().forEach(track => track.stop())
    video.srcObject = null
  }
}

export function readAnnotationPng(file: File): Promise<AnnotationImage> {
  if (file.type !== 'image/png' || file.size > 20 * 1024 * 1024) {
    return Promise.reject(new Error('Attach a PNG screenshot of at most 20 MB'))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve({ dataUrl: reader.result, capturedAt: null })
      : reject(new Error('Could not read the screenshot'))
    reader.onerror = () => reject(new Error('Could not read the screenshot'))
    reader.onabort = () => reject(new Error('Screenshot reading was cancelled'))
    reader.readAsDataURL(file)
  })
}
