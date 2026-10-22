import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'

const storageKey = 'atomic-workspace-panel-width'
const defaultWidth = 544

function readWidth() {
  try {
    const value = Number(localStorage.getItem(storageKey))
    return Number.isFinite(value) && value > 0 && value <= 10000 ? value : defaultWidth
  } catch { return defaultWidth }
}

/** Size against the available chat area, including when the navigation resizes. */
export function useWorkspacePanelSize(open: boolean, resizeFromLeft = false) {
  const panelRef = useRef<HTMLElement>(null)
  const drag = useRef<{ pointer: number; x: number; width: number } | null>(null)
  const [preferredWidth, setPreferredWidth] = useState(readWidth)
  const [available, setAvailable] = useState(1024)
  const [expanded, setExpanded] = useState(false)
  const [desktop, setDesktop] = useState(() => window.innerWidth >= 768)

  useEffect(() => {
    const update = () => setDesktop(window.innerWidth >= 768)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (!open) drag.current = null
    const parent = panelRef.current?.parentElement
    if (!open || !parent) return
    const measure = () => setAvailable(parent.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [open])

  // Leave a usable chat column even when the navigation occupies much of the window.
  const maxWidth = Math.max(0, available - Math.min(320, available * 0.45))
  const minWidth = Math.min(320, maxWidth)
  const clamp = (value: number) => Math.round(Math.max(minWidth, Math.min(maxWidth, value)))
  const width = expanded ? Math.round(maxWidth) : clamp(preferredWidth)
  const resize = (value: number) => {
    const next = clamp(value)
    setPreferredWidth(next)
    setExpanded(false)
    try { localStorage.setItem(storageKey, String(next)) } catch { /* Session resizing still works. */ }
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointer: event.pointerId, x: event.clientX, width }
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointer !== event.pointerId) return
    resize(drag.current.width + (event.clientX - drag.current.x) * (resizeFromLeft ? -1 : 1))
  }
  const stopDrag = () => { drag.current = null }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const sizes: Record<string, number> = { ArrowLeft: width + (resizeFromLeft ? 24 : -24), ArrowRight: width + (resizeFromLeft ? -24 : 24), Home: minWidth, End: maxWidth }
    const next = Object.prototype.hasOwnProperty.call(sizes, event.key) ? sizes[event.key] : undefined
    if (next === undefined) return
    event.preventDefault()
    resize(next)
  }

  return {
    panelRef, width, expanded, desktop, minWidth, maxWidth,
    toggleExpanded: () => setExpanded(value => !value),
    separatorProps: { onPointerDown, onPointerMove, onPointerUp: stopDrag, onPointerCancel: stopDrag, onLostPointerCapture: stopDrag, onKeyDown },
  }
}
