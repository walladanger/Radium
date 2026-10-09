import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  compareBenchmarkRuns,
  computeBenchmarkStats,
  noiseFloorFor,
  runPerformanceBenchmarks,
  type BenchmarkRun,
} from '../performance-benchmark'

describe('performance benchmark helpers', () => {
  it('computes median, p95, min, max and stddev without inventing zeros', () => {
    expect(computeBenchmarkStats([])).toEqual({
      median: null,
      p95: null,
      min: null,
      max: null,
      stddev: null,
    })

    const stats = computeBenchmarkStats([1, 2, 3, 4, 100])
    expect(stats.median).toBe(3)
    expect(stats.p95).toBe(100)
    expect(stats.min).toBe(1)
    expect(stats.max).toBe(100)
    expect(stats.stddev).toBeTypeOf('number')
  })

  it('respects lower-is-better versus higher-is-better', () => {
    const baseline: BenchmarkRun = {
      runId: 'base',
      at: '2026-01-01T00:00:00.000Z',
      results: [
        { id: 'latency', name: 'Latency', unit: 'ms', higherIsBetter: false, values: [100,100,100], samples: 3, median: 100, p95: 100, min: 100, max: 100, stddev: 0 },
        { id: 'throughput', name: 'Throughput', unit: 'tok/s', higherIsBetter: true, values: [100,100,100], samples: 3, median: 100, p95: 100, min: 100, max: 100, stddev: 0 },
      ],
    }
    const later: BenchmarkRun = {
      runId: 'later',
      at: '2026-01-02T00:00:00.000Z',
      results: [
        { ...baseline.results[0], values: [80,80,80], median: 80 },
        { ...baseline.results[1], values: [80,80,80], median: 80 },
      ],
    }

    const comparison = compareBenchmarkRuns(later, baseline)
    expect(comparison.latency.verdict).toBe('better')
    expect(comparison.throughput.verdict).toBe('worse')
  })

  it('derives a wider noise floor for noisy samples', () => {
    expect(noiseFloorFor({ median: 100, stddev: 8, samples: 10 }))
      .toBeGreaterThan(noiseFloorFor({ median: 100, stddev: 0.5, samples: 10 }))
  })
})

describe('local API benchmark sampling', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([[false, true, false], [true, false, true], [true, true, true]])(
    'retains successful samples with failures %j, %j, %j',
    async (...failures) => {
      vi.stubGlobal('requestAnimationFrame', undefined)
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true, json: async () => ({ data: [{ id: 'local' }] }),
      })
      for (const fails of failures) {
        if (fails) fetchMock.mockRejectedValueOnce(new Error('sample failed'))
        else fetchMock.mockResolvedValueOnce(new Response(
          'data: {"choices":[{"delta":{"content":"hello"}}],"usage":{"completion_tokens":5}}\n\ndata: [DONE]\n\n'
        ))
      }
      vi.stubGlobal('fetch', fetchMock)
      const run = await runPerformanceBenchmarks({ sampleHardware: async () => ({}) })
      const results = run.results.filter((result) => result.id.startsWith('inference.'))
      const successes = failures.filter((failed) => !failed).length
      expect(fetchMock).toHaveBeenCalledTimes(4)
      for (const result of results) {
        expect(result.samples).toBe(successes)
        if (successes) {
          expect(result.skipped).toBeFalsy()
          expect(result.median).toBeTypeOf('number')
        } else {
          expect(result.skipped).toBe(true)
          expect(result.reason).toBe('sample failed')
        }
      }
    }
  )
})
