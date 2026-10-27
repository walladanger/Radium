import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  markDownloadCancellationRequested,
  wasDownloadCancellationRequested,
  clearDownloadCancellationRequested,
} from '../downloadCancellation'

describe('downloadCancellation', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false for unknown id', () => {
    expect(wasDownloadCancellationRequested('unknown-1')).toBe(false)
  })

  it('returns true after markDownloadCancellationRequested', () => {
    markDownloadCancellationRequested('dl-1')
    expect(wasDownloadCancellationRequested('dl-1')).toBe(true)
  })

  it('returns false after clearDownloadCancellationRequested', () => {
    markDownloadCancellationRequested('dl-2')
    expect(wasDownloadCancellationRequested('dl-2')).toBe(true)
    clearDownloadCancellationRequested('dl-2')
    expect(wasDownloadCancellationRequested('dl-2')).toBe(false)
  })

  it('returns true exactly 15000 ms after mark', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1000000000000))

    markDownloadCancellationRequested('dl-3')

    vi.setSystemTime(new Date(1000000000000 + 15000))
    expect(wasDownloadCancellationRequested('dl-3')).toBe(true)
  })

  it('returns false and removes entry 15001 ms after mark', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1000000000000))

    markDownloadCancellationRequested('dl-4')

    // Move time past TTL
    vi.setSystemTime(new Date(1000000000000 + 15001))

    // First check evaluates false and deletes entry
    expect(wasDownloadCancellationRequested('dl-4')).toBe(false)

    // Move time back to within original TTL
    vi.setSystemTime(new Date(1000000000000 + 10000))

    // Second check still evaluates false because entry was deleted
    expect(wasDownloadCancellationRequested('dl-4')).toBe(false)
  })

  it('treats ids independently', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1000000000000))

    markDownloadCancellationRequested('dl-a')

    vi.setSystemTime(new Date(1000000000000 + 5000))

    markDownloadCancellationRequested('dl-b')

    vi.setSystemTime(new Date(1000000000000 + 15001))

    // dl-a is older than 15000ms
    expect(wasDownloadCancellationRequested('dl-a')).toBe(false)

    // dl-b is 10001ms old, so it's still within the 15000ms window
    expect(wasDownloadCancellationRequested('dl-b')).toBe(true)
  })
})
