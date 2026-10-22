import { describe, expect, it } from 'vitest'
import { LiveGenerationMeter } from './live-generation-metrics'

describe('live generation metrics', () => {
  it('counts growing output, preserves the observed peak and allows the measured rate to fall', () => {
    const meter = new LiveGenerationMeter()
    expect(meter.sample('', 0).tokenCount).toBe(0)
    expect(meter.sample('hello', 1000).tokenSpeed).toBe(0)
    const first = meter.sample('hello world', 1500)
    const grown = meter.sample('hello world again and again', 2000)
    const paused = meter.sample('hello world again and again', 5000)
    expect(grown.tokenCount).toBeGreaterThan(first.tokenCount)
    expect(paused.tokenCount).toBe(grown.tokenCount)
    expect(paused.tokenSpeed).toBeLessThan(grown.tokenSpeed)
    expect(paused.peak).toBe(Math.max(first.tokenSpeed, grown.tokenSpeed))
  })
})
