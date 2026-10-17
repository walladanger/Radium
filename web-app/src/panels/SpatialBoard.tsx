import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { PanelTile } from './PanelTile'
import { useBoard } from './useBoard'
import { GRID_SIZE, MIN_PANEL, moveRect, normalizeRect, zoomViewport, type Rect, type Viewport } from './workspaceDocument'

const control = 'rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40'

/** Shared layout controls. Split remains available for existing boards. */
export function LayoutControls() {
  const mode = useBoard((state) => state.mode)
  const snap = useBoard((state) => state.snap)
  return <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
    {(['split', 'windows', 'canvas'] as const).map((entry) => <button key={entry} type="button"
      className={control} aria-pressed={mode === entry} onClick={() => {
        const board = useBoard.getState()
        const hasCustom = board.open.some((id) => (board.panels[id]?.definitionId ?? id).startsWith('panel:'))
        if (entry !== mode && (entry === 'split' || mode === 'split') && hasCustom &&
          !window.confirm('Switching to or from Split reloads custom panel GUIs and can lose unsaved changes. Continue?')) return
        board.setMode(entry)
      }}>
      {entry[0].toUpperCase() + entry.slice(1)}
    </button>)}
    {mode !== 'split' && <label className="ml-2 flex items-center gap-1 text-xs text-muted-foreground">
      <input type="checkbox" checked={snap} onChange={(event) => useBoard.getState().setSnap(event.target.checked)} /> Snap to grid
    </label>}
  </div>
}

/** A gesture owns its listeners and discards an unfinished preview on cancel/unmount. */
function usePointerGesture() {
  const cleanup = useRef<() => void>(() => {})
  useEffect(() => () => cleanup.current(), [])
  return (event: ReactPointerEvent, move: (dx: number, dy: number) => void, end: (commit: boolean) => void) => {
    if (event.button !== 0 && event.button !== 1) return
    event.preventDefault()
    event.stopPropagation()
    cleanup.current()
    const x = event.clientX, y = event.clientY, pointerId = event.pointerId
    const matches = (next: PointerEvent) => next.pointerId === pointerId
    const onMove = (next: PointerEvent) => { if (matches(next)) move(next.clientX - x, next.clientY - y) }
    const remove = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onBlur)
      cleanup.current = () => {}
    }
    const finish = (commit: boolean) => { remove(); end(commit) }
    const onUp = (next: PointerEvent) => { if (matches(next)) finish(true) }
    const onCancel = (next: PointerEvent) => { if (matches(next)) finish(false) }
    const onBlur = () => finish(false)
    cleanup.current = remove
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onBlur)
  }
}

/** Windows and Canvas share keyed DOM frames so focus, resize and mode changes keep GUIs alive. */
export function SpatialBoard({ renderPanel, titleFor }: {
  renderPanel: (id: string) => ReactNode
  titleFor: (id: string) => string
}) {
  const open = useBoard((state) => state.open)
  const panels = useBoard((state) => state.panels)
  const mode = useBoard((state) => state.mode)
  const locked = useBoard((state) => state.locked)
  const snap = useBoard((state) => state.snap)
  const viewport = useBoard((state) => state.viewport)
  const canvas = mode === 'canvas'
  const host = useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = useState({ width: 1000, height: 700 })
  const [scroll, setScroll] = useState({ x: 0, y: 0 })
  const [pan, setPan] = useState<Viewport | null>(null)
  const currentPan = useRef<Viewport | null>(null)
  const [moving, setMoving] = useState(false)
  const gesture = usePointerGesture()
  const vp = canvas ? pan ?? viewport : { x: 0, y: 0, zoom: 1 }

  useEffect(() => {
    const element = host.current
    if (!element) return
    const measure = () => setBounds({ width: element.clientWidth || 1000, height: element.clientHeight || 700 })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const element = host.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      if (!canvas || locked || !(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      const box = element.getBoundingClientRect()
      const before = useBoard.getState().viewport
      useBoard.getState().setViewport(zoomViewport(before, before.zoom * Math.exp(-event.deltaY * 0.002),
        { x: event.clientX - box.left, y: event.clientY - box.top }))
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [canvas, locked])

  const zoom = (factor: number) => useBoard.getState().setViewport(
    zoomViewport(viewport, viewport.zoom * factor, { x: bounds.width / 2, y: bounds.height / 2 }))
  return <div className="flex size-full min-h-0 flex-col">
    <LayoutControls />
    {canvas && <div className="flex shrink-0 items-center gap-1 px-2 py-1">
      <button className={control} onClick={() => zoom(0.8)} disabled={locked} aria-label="Zoom out">−</button>
      <span className="w-12 text-center text-xs" aria-label="Canvas zoom">{Math.round(vp.zoom * 100)}%</span>
      <button className={control} onClick={() => zoom(1.25)} disabled={locked} aria-label="Zoom in">+</button>
      <button className={control} disabled={locked} onClick={() => useBoard.getState().setViewport({ x: 0, y: 0, zoom: 1 })}>Reset view</button>
      <span className="ml-2 text-xs text-muted-foreground">Drag background to pan · Ctrl+wheel on background to zoom</span>
    </div>}
    <div ref={host} className={'relative min-h-0 flex-1 bg-background ' + (canvas ? 'overflow-hidden' : 'overflow-auto')}
      data-workspace-surface
      onScroll={(event) => setScroll({ x: event.currentTarget.scrollLeft, y: event.currentTarget.scrollTop })}
      style={canvas && snap ? {
        backgroundImage: 'radial-gradient(var(--muted-foreground) 1px, transparent 1px)',
        backgroundSize: GRID_SIZE * vp.zoom + 'px ' + GRID_SIZE * vp.zoom + 'px',
        backgroundPosition: vp.x + 'px ' + vp.y + 'px',
      } : undefined}
      onPointerDown={(event) => {
        if (!canvas || locked || (event.button !== 0 && event.button !== 1) || !(event.target instanceof HTMLElement) || !event.target.hasAttribute('data-workspace-background')) return
        currentPan.current = viewport
        setMoving(true)
        gesture(event, (dx, dy) => {
          currentPan.current = { ...viewport, x: viewport.x + dx, y: viewport.y + dy }
          setPan(currentPan.current)
        }, (commit) => {
          if (commit && currentPan.current) useBoard.getState().setViewport(currentPan.current)
          setPan(null); setMoving(false)
        })
      }}>
      <div data-workspace-background className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 origin-top-left"
        style={{ transform: 'translate(' + vp.x + 'px,' + vp.y + 'px) scale(' + vp.zoom + ')' }}>
        {/* Stable order keeps focus changes from moving iframe DOM nodes. z-index carries stacking. */}
        {[...open].sort().map((id) => panels[id] && <SpatialPanel key={id} id={id} title={titleFor(id)}
          bounds={bounds} viewport={vp} scroll={scroll} onGesture={setMoving}>
          {renderPanel(id)}
        </SpatialPanel>)}
      </div>
      {moving && <div className="absolute inset-0 z-[1000]" data-gesture-shield />}
    </div>
    {open.some((id) => panels[id]?.minimized) && <div className="flex shrink-0 flex-wrap gap-1 border-t border-border p-1">
      {open.filter((id) => panels[id]?.minimized).map((id) => <button key={id} className={control}
        aria-label={'Restore ' + titleFor(id)} onClick={() => useBoard.getState().toggleMinimized(id)}
        disabled={locked}>{titleFor(id)}</button>)}
    </div>}
  </div>
}

function SpatialPanel({ id, title, children, bounds, viewport, scroll, onGesture }: {
  id: string; title: string; children: ReactNode; bounds: { width: number; height: number };
  viewport: Viewport; onGesture: (moving: boolean) => void
  scroll: { x: number; y: number }
}) {
  const panel = useBoard((state) => state.panels[id])
  const mode = useBoard((state) => state.mode)
  const locked = useBoard((state) => state.locked)
  const snap = useBoard((state) => state.snap)
  const zIndex = useBoard((state) => state.open.indexOf(id))
  const gesture = usePointerGesture()
  const [preview, setPreview] = useState<Rect | null>(null)
  const draft = useRef<Rect | null>(null)
  const canvas = mode === 'canvas'
  const base = panel[canvas ? 'canvas' : 'windows']
  const rect = panel.maximized ? {
    x: canvas ? -viewport.x / viewport.zoom : scroll.x, y: canvas ? -viewport.y / viewport.zoom : scroll.y,
    width: bounds.width / viewport.zoom, height: bounds.height / viewport.zoom,
  } : preview ?? base

  const begin = (event: ReactPointerEvent, resize: boolean) => {
    if (locked || panel.maximized || event.button !== 0) return
    draft.current = base
    onGesture(true)
    gesture(event, (dx, dy) => {
      const x = dx / viewport.zoom, y = dy / viewport.zoom
      const size = (n: number) => snap ? Math.round(n / GRID_SIZE) * GRID_SIZE : n
      draft.current = resize ? normalizeRect({
        ...base, width: size(base.width + x), height: size(base.height + y),
      }, base, canvas) : moveRect(base, x, y, mode, snap)
      setPreview(draft.current)
    }, (commit) => {
      if (commit && draft.current) useBoard.getState().setRect(id, draft.current)
      setPreview(null); onGesture(false)
    })
  }
  return <div className="pointer-events-auto absolute" data-panel-instance={id}
    onPointerDownCapture={() => useBoard.getState().focusPanel(id)}
    style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height,
      zIndex: panel.maximized ? 200 : zIndex + 1, display: panel.minimized ? 'none' : undefined }}>
    <PanelTile title={title} onClose={() => useBoard.getState().closePanel(id)}
      titleControl={<button type="button" className="min-w-0 flex-1 cursor-move truncate text-left text-xs font-semibold disabled:cursor-default"
        aria-label={'Move ' + title} disabled={locked || panel.maximized}
        onPointerDown={(event) => begin(event, false)}
        onKeyDown={(event) => {
          const delta: Record<string, [number, number]> = {
            ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16],
          }
          if (!delta[event.key]) return
          event.preventDefault()
          useBoard.getState().setRect(id, moveRect(base, ...delta[event.key], mode, snap))
        }}>{title}</button>}
      headerActions={<>
        <button className={control} disabled={locked} aria-label={'Minimize ' + title} onClick={() => useBoard.getState().toggleMinimized(id)}>−</button>
        <button className={control} disabled={locked} aria-label={(panel.maximized ? 'Restore size ' : 'Maximize ') + title}
          onClick={() => useBoard.getState().toggleMaximized(id)}>□</button>
      </>}>
      {children}
    </PanelTile>
    <button type="button" className="absolute bottom-0 right-0 size-4 cursor-se-resize rounded-br-lg border-b-2 border-r-2 border-muted-foreground disabled:cursor-default"
      aria-label={'Resize ' + title} disabled={locked || panel.maximized}
      onPointerDown={(event) => begin(event, true)}
      onKeyDown={(event) => {
        const delta: Record<string, [number, number]> = {
          ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16],
        }
        if (!delta[event.key]) return
        event.preventDefault()
        useBoard.getState().setRect(id, { ...base, width: Math.max(MIN_PANEL.width, base.width + delta[event.key][0]),
          height: Math.max(MIN_PANEL.height, base.height + delta[event.key][1]) })
      }} />
  </div>
}
