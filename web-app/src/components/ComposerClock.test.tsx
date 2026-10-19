import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ComposerClock, MessageTimestamp } from './ComposerClock'

afterEach(() => { cleanup(); vi.useRealTimers() })

it('advances the composer clock while saved message timestamps remain fixed', () => {
  vi.useFakeTimers()
  const now = new Date(2026, 9, 16, 15, 30, 0)
  vi.setSystemTime(now)
  render(<><ComposerClock /><MessageTimestamp value={now.getTime()} /><MessageTimestamp value={new Date(2026, 9, 15, 15).getTime()} /></>)
  const clock = screen.getByLabelText('Current local time')
  const initial = clock.textContent
  act(() => { vi.advanceTimersByTime(1000) })
  expect(clock.textContent).not.toBe(initial)
  const times = document.querySelectorAll('time')
  expect(times[1].textContent).toBe(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  expect(times[2].textContent).toContain('15')
  expect(times[1]).toHaveAttribute('dateTime', now.toISOString())
})
