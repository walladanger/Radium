import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkspacePanelSize } from '../useWorkspacePanelSize'
import type { PointerEvent, KeyboardEvent } from 'react'

describe('useWorkspacePanelSize', () => {
  let localStorageMock: Record<string, string> = {}
  let observerMeasure: (() => void) | null = null

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => localStorageMock[key] ?? null,
      setItem: (key: string, value: string) => { localStorageMock[key] = value },
    })

    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) {
        observerMeasure = () => callback([], this)
      }
      observe() {}
      disconnect() { observerMeasure = null }
    })

    vi.stubGlobal('window', {
      ...window,
      innerWidth: 1024,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorageMock = {}
    observerMeasure = null
  })

  it('reads initial width from localStorage', () => {
    localStorageMock['atomic-workspace-panel-width'] = '400'
    const { result } = renderHook(() => useWorkspacePanelSize(true))
    expect(result.current.width).toBe(400)
    expect(result.current.expanded).toBe(false)
  })

  it('falls back to default if localStorage is invalid', () => {
    localStorageMock['atomic-workspace-panel-width'] = 'invalid'
    const { result } = renderHook(() => useWorkspacePanelSize(true))
    expect(result.current.width).toBe(544)
  })

  it('clamps initial width to available constraints', () => {
    // default available is 1024. maxWidth is 1024 - 320 = 704. minWidth is 320.
    localStorageMock['atomic-workspace-panel-width'] = '800'
    const { result } = renderHook(() => useWorkspacePanelSize(true))
    expect(result.current.width).toBe(704)
    expect(result.current.maxWidth).toBe(704)
    expect(result.current.minWidth).toBe(320)
  })

  it('measures parent on open and sets available width', () => {
    const { result, rerender } = renderHook((open) => useWorkspacePanelSize(open), { initialProps: false })

    const panel = document.createElement('div')
    const parent = document.createElement('div')
    parent.appendChild(panel)
    // mock getBoundingClientRect
    parent.getBoundingClientRect = () => ({ width: 800 } as DOMRect)

    // Assign ref manually
    ;(result.current.panelRef as any).current = panel

    rerender(true)

    // available = 800.
    // maxWidth = 800 - min(320, 800*0.45(360)) = 800 - 320 = 480
    // minWidth = min(320, 480) = 320
    expect(result.current.maxWidth).toBe(480)
    expect(result.current.minWidth).toBe(320)
  })

  describe('pointer drag resizing', () => {
    it('handles pointer drag resizing from the right', () => {
      const { result } = renderHook(() => useWorkspacePanelSize(true))

      const mockEventDown = {
        button: 0,
        preventDefault: vi.fn(),
        pointerId: 1,
        clientX: 100,
        currentTarget: {
          focus: vi.fn(),
          setPointerCapture: vi.fn(),
        },
      } as unknown as PointerEvent<HTMLDivElement>

      act(() => {
        result.current.separatorProps.onPointerDown(mockEventDown)
      })

      expect(mockEventDown.preventDefault).toHaveBeenCalled()
      expect(mockEventDown.currentTarget.setPointerCapture).toHaveBeenCalledWith(1)

      const mockEventMove = {
        pointerId: 1,
        clientX: 150, // Moved 50px right
      } as unknown as PointerEvent<HTMLDivElement>

      act(() => {
        result.current.separatorProps.onPointerMove(mockEventMove)
      })

      // Default width is 544. +50 = 594.
      expect(result.current.width).toBe(594)
      expect(localStorageMock['atomic-workspace-panel-width']).toBe('594')

      act(() => {
        result.current.separatorProps.onPointerUp(mockEventMove)
      })

      const mockEventMoveAfterDrop = {
        pointerId: 1,
        clientX: 200,
      } as unknown as PointerEvent<HTMLDivElement>

      act(() => {
        result.current.separatorProps.onPointerMove(mockEventMoveAfterDrop)
      })

      // Still 594, because drag was stopped
      expect(result.current.width).toBe(594)
    })

    it('inverts drag direction when resizeFromLeft=true', () => {
      const { result } = renderHook(() => useWorkspacePanelSize(true, true))

      act(() => {
        result.current.separatorProps.onPointerDown({
          button: 0, preventDefault: vi.fn(), pointerId: 1, clientX: 100,
          currentTarget: { focus: vi.fn(), setPointerCapture: vi.fn() }
        } as unknown as PointerEvent<HTMLDivElement>)
      })

      act(() => {
        result.current.separatorProps.onPointerMove({ pointerId: 1, clientX: 150 } as unknown as PointerEvent<HTMLDivElement>)
      })

      // Default width 544. ClientX increased by 50. With resizeFromLeft, it should decrease by 50. -> 494.
      expect(result.current.width).toBe(494)
    })

    it('ignores pointer events with wrong button or wrong pointerId', () => {
      const { result } = renderHook(() => useWorkspacePanelSize(true))

      const mockEventDown = {
        button: 1, // Not left click
        preventDefault: vi.fn(),
      } as unknown as PointerEvent<HTMLDivElement>

      act(() => {
        result.current.separatorProps.onPointerDown(mockEventDown)
      })

      expect(mockEventDown.preventDefault).not.toHaveBeenCalled()

      // Test drag start with correct button but move with wrong pointerId
      act(() => {
        result.current.separatorProps.onPointerDown({
          button: 0, preventDefault: vi.fn(), pointerId: 1, clientX: 100,
          currentTarget: { focus: vi.fn(), setPointerCapture: vi.fn() }
        } as unknown as PointerEvent<HTMLDivElement>)
      })

      act(() => {
        result.current.separatorProps.onPointerMove({ pointerId: 2, clientX: 150 } as unknown as PointerEvent<HTMLDivElement>)
      })

      // Unchanged
      expect(result.current.width).toBe(544)
    })
  })

  describe('keyboard resizing', () => {
    it('resizes with keyboard arrows (resizeFromLeft=false)', () => {
      const { result } = renderHook(() => useWorkspacePanelSize(true))

      const mockEventLeft = { key: 'ArrowLeft', preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLDivElement>
      act(() => { result.current.separatorProps.onKeyDown(mockEventLeft) })
      // Default 544, ArrowLeft decreases by 24 = 520
      expect(result.current.width).toBe(520)
      expect(mockEventLeft.preventDefault).toHaveBeenCalled()

      const mockEventRight = { key: 'ArrowRight', preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLDivElement>
      act(() => { result.current.separatorProps.onKeyDown(mockEventRight) })
      // 520 + 24 = 544
      expect(result.current.width).toBe(544)
    })

    it('resizes with keyboard arrows inverted (resizeFromLeft=true)', () => {
      const { result } = renderHook(() => useWorkspacePanelSize(true, true))

      act(() => { result.current.separatorProps.onKeyDown({ key: 'ArrowLeft', preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLDivElement>) })
      // 544 + 24 = 568
      expect(result.current.width).toBe(568)

      act(() => { result.current.separatorProps.onKeyDown({ key: 'ArrowRight', preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLDivElement>) })
      // 568 - 24 = 544
      expect(result.current.width).toBe(544)
    })

    it('resizes to min/max with Home/End', () => {
      const { result } = renderHook(() => useWorkspacePanelSize(true))

      act(() => { result.current.separatorProps.onKeyDown({ key: 'Home', preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLDivElement>) })
      expect(result.current.width).toBe(320) // minWidth

      act(() => { result.current.separatorProps.onKeyDown({ key: 'End', preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLDivElement>) })
      expect(result.current.width).toBe(704) // maxWidth
    })

    it('ignores unknown keys', () => {
      const { result } = renderHook(() => useWorkspacePanelSize(true))

      const mockEvent = { key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLDivElement>
      act(() => { result.current.separatorProps.onKeyDown(mockEvent) })
      expect(result.current.width).toBe(544)
      expect(mockEvent.preventDefault).not.toHaveBeenCalled()
    })
  })

  describe('behavior when open is false', () => {
    it('cancels drag if open becomes false', () => {
      const { result, rerender } = renderHook((open) => useWorkspacePanelSize(open), { initialProps: true })

      act(() => {
        result.current.separatorProps.onPointerDown({
          button: 0, preventDefault: vi.fn(), pointerId: 1, clientX: 100,
          currentTarget: { focus: vi.fn(), setPointerCapture: vi.fn() }
        } as unknown as PointerEvent<HTMLDivElement>)
      })

      rerender(false)

      act(() => {
        result.current.separatorProps.onPointerMove({ pointerId: 1, clientX: 150 } as unknown as PointerEvent<HTMLDivElement>)
      })

      // Should not have resized
      expect(result.current.width).toBe(544)
    })
  })

  describe('expanded behavior', () => {
    it('toggles expanded state and resizes to max width', () => {
      const { result } = renderHook(() => useWorkspacePanelSize(true))

      expect(result.current.expanded).toBe(false)
      expect(result.current.width).toBe(544)

      act(() => { result.current.toggleExpanded() })

      expect(result.current.expanded).toBe(true)
      expect(result.current.width).toBe(704) // maxWidth

      act(() => { result.current.toggleExpanded() })

      expect(result.current.expanded).toBe(false)
      expect(result.current.width).toBe(544)
    })

    it('cancels expanded state when manually resized', () => {
      const { result } = renderHook(() => useWorkspacePanelSize(true))

      act(() => { result.current.toggleExpanded() })
      expect(result.current.expanded).toBe(true)

      act(() => { result.current.separatorProps.onKeyDown({ key: 'ArrowLeft', preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLDivElement>) })

      expect(result.current.expanded).toBe(false)
      // Max was 704, manual resize logic: next = clamp(size). wait, resize uses clamp(value).
      // ArrowLeft uses width (which is 704 when expanded) - 24 = 680.
      expect(result.current.width).toBe(680)
    })
  })
})
