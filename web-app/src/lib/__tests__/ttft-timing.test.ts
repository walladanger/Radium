import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const importTiming = async () => {
  vi.resetModules()
  return await import('../ttft-timing')
}

describe('ttft-timing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('ttftSnapshot() returns null before ttftBegin()', async () => {
    const { ttftSnapshot } = await importTiming()
    expect(ttftSnapshot()).toBeNull()
  })

  it('ttftPreBegin() does not start a session', async () => {
    const { ttftPreBegin, ttftSnapshot } = await importTiming()
    ttftPreBegin('test-label')
    expect(ttftSnapshot()).toBeNull()
  })

  it('ttftMark() / ttftMarkFromRust() before ttftBegin() are ignored', async () => {
    const { ttftMark, ttftMarkFromRust, ttftBegin, ttftSnapshot } =
      await importTiming()
    vi.setSystemTime(1000)
    ttftMark('beta')
    ttftMarkFromRust('etaFirstToken', 1050)

    vi.setSystemTime(2000)
    ttftBegin()
    expect(ttftSnapshot()).toEqual({})
  })

  it('returns exactly the expected ms for every field on the happy path', async () => {
    const { ttftBegin, ttftMark, ttftMarkFromRust, ttftSnapshot } =
      await importTiming()

    vi.setSystemTime(1000) // alpha
    ttftBegin()

    vi.setSystemTime(1050) // beta
    ttftMark('beta')

    vi.setSystemTime(1070) // gammaStart
    ttftMark('gammaStart')

    vi.setSystemTime(1100) // gammaEnd
    ttftMark('gammaEnd')

    vi.setSystemTime(1120) // deltaStart
    ttftMark('deltaStart')

    vi.setSystemTime(1200) // deltaEnd
    ttftMark('deltaEnd')

    vi.setSystemTime(1210) // epsilonInvoke
    ttftMark('epsilonInvoke')

    vi.setSystemTime(1250) // epsilonFirstChunk
    ttftMark('epsilonFirstChunk')

    // Rust times are absolute ms
    ttftMarkFromRust('zetaProxyIn', 1260)
    ttftMarkFromRust('zetaUpstreamHeaders', 1300)
    ttftMarkFromRust('etaFirstToken', 1500)

    vi.setSystemTime(1550) // thetaFirstRender
    ttftMark('thetaFirstRender')

    const snapshot = ttftSnapshot()
    expect(snapshot).toEqual({
      ttft_e2e_ms: 500, // 1500 (etaFirstToken) - 1000 (alpha)
      ttft_attachments_ms: 50, // 1050 (beta) - 1000 (alpha)
      ttft_tools_ms: 50, // 1100 (gammaEnd) - 1050 (beta)
      ttft_create_model_ms: 100, // 1200 (deltaEnd) - 1100 (gammaEnd)
      ttft_ipc_ms: 50, // 1250 (epsilonFirstChunk) - 1200 (deltaEnd)
      ttft_proxy_ms: 50, // 1300 (zetaUpstreamHeaders) - 1250 (epsilonFirstChunk)
      ttft_backend_ms: 200, // 1500 (etaFirstToken) - 1300 (zetaUpstreamHeaders)
      ttft_render_ms: 50, // 1550 (thetaFirstRender) - 1500 (etaFirstToken)
    })
  })

  it('uses first-token fallback and handles missing beta', async () => {
    const { ttftBegin, ttftMark, ttftSnapshot } = await importTiming()

    vi.setSystemTime(1000) // alpha
    ttftBegin()

    vi.setSystemTime(1100) // gammaEnd
    ttftMark('gammaEnd')

    vi.setSystemTime(1200) // deltaEnd
    ttftMark('deltaEnd')

    vi.setSystemTime(1300) // epsilonFirstChunk
    ttftMark('epsilonFirstChunk')

    // No beta, no Rust markers
    vi.setSystemTime(1400) // thetaFirstRender
    ttftMark('thetaFirstRender')

    const snapshot = ttftSnapshot()
    expect(snapshot).toEqual({
      ttft_e2e_ms: 300, // 1300 (epsilonFirstChunk) - 1000 (alpha)
      ttft_tools_ms: 100, // 1100 (gammaEnd) - 1000 (alpha)
      ttft_create_model_ms: 100, // 1200 (deltaEnd) - 1100 (gammaEnd)
      ttft_ipc_ms: 100, // 1300 (epsilonFirstChunk) - 1200 (deltaEnd)
      ttft_render_ms: 100, // 1400 (thetaFirstRender) - 1300 (epsilonFirstChunk)
    })
  })

  it('omits entirely fields with a missing endpoint and does not clear state', async () => {
    const { ttftBegin, ttftMark, ttftSnapshot } = await importTiming()

    vi.setSystemTime(1000)
    ttftBegin()

    vi.setSystemTime(1200)
    ttftMark('epsilonFirstChunk')

    const snapshot1 = ttftSnapshot()
    expect(snapshot1).toEqual({
      ttft_e2e_ms: 200,
    })

    // Ensure the key really is absent (not undefined)
    expect('ttft_render_ms' in snapshot1!).toBe(false)

    // State is not cleared
    const snapshot2 = ttftSnapshot()
    expect(snapshot2).toEqual(snapshot1)
  })

  it('ttftMarkFromRust stores the given epochMs, unclamped for negative delta', async () => {
    const { ttftBegin, ttftMarkFromRust, ttftSnapshot } = await importTiming()

    vi.setSystemTime(2000)
    ttftBegin() // alpha = 2000

    // Rust gives a time before alpha
    ttftMarkFromRust('etaFirstToken', 1900)

    const snapshot = ttftSnapshot()
    expect(snapshot).toEqual({
      ttft_e2e_ms: -100, // 1900 - 2000
    })
  })

  it('ttftBegin() again resets all markers', async () => {
    const { ttftBegin, ttftMark, ttftSnapshot } = await importTiming()

    vi.setSystemTime(1000)
    ttftBegin()
    vi.setSystemTime(1100)
    ttftMark('beta')
    ttftMark('gammaEnd')
    ttftMark('epsilonFirstChunk')

    expect(ttftSnapshot()?.ttft_attachments_ms).toBe(100)

    // Second begin
    vi.setSystemTime(2000)
    ttftBegin()

    vi.setSystemTime(2500)
    ttftMark('epsilonFirstChunk') // Provide a fallback first token to see e2e

    const snapshot = ttftSnapshot()
    expect(snapshot).toEqual({
      ttft_e2e_ms: 500,
    })
    expect('ttft_attachments_ms' in snapshot!).toBe(false)
  })

  describe('ttftReport()', () => {
    it('does not print when explicitly disabled', async () => {
      vi.stubEnv('VITE_TTFT_TIMING', '')
      vi.stubEnv('DEV', false)
      const { ttftBegin, ttftReport, ttftEnabled } = await importTiming()
      const consoleSpy = vi.spyOn(console, 'table').mockImplementation(() => {})

      expect(ttftEnabled()).toBe(false)
      ttftBegin()
      ttftReport('report')
      expect(consoleSpy).not.toHaveBeenCalled()
    })

    it('prints at most once per session when explicitly enabled', async () => {
      vi.stubEnv('VITE_TTFT_TIMING', 'true')
      vi.stubEnv('DEV', false)
      const {
        ttftBegin,
        ttftMark,
        ttftMarkFromRust,
        ttftReport,
        ttftEnabled,
        ttftSnapshot,
      } = await importTiming()
      const consoleSpy = vi.spyOn(console, 'table').mockImplementation(() => {})

      expect(ttftEnabled()).toBe(true)

      vi.setSystemTime(1000)
      ttftBegin()
      vi.setSystemTime(1050)
      ttftMark('beta')
      vi.setSystemTime(1100)
      ttftMark('gammaEnd')
      vi.setSystemTime(1200)
      ttftMark('deltaEnd')
      vi.setSystemTime(1300)
      ttftMark('epsilonFirstChunk')
      ttftMarkFromRust('zetaUpstreamHeaders', 1350)
      ttftMarkFromRust('etaFirstToken', 1500)
      vi.setSystemTime(1550)
      ttftMark('thetaFirstRender')

      ttftReport('first report')

      expect(consoleSpy).toHaveBeenCalledOnce()
      expect(consoleSpy).toHaveBeenCalledWith({
        'reason': 'first report',
        'β−α attachments': 50,
        'γ−β refreshTools': 50,
        'δ−γ createModel': 100,
        'ε−δ first IPC chunk': 100,
        'ζ−ε proxy→upstream': 50,
        'η−ζ backend TTFT': 150,
        'θ−α total visible': 550,
        'θ−η UI after stream': 50,
      })

      // Calling again in the same session doesn't print
      ttftReport('second report')
      expect(consoleSpy).toHaveBeenCalledOnce()

      // Ensure snapshot data is preserved
      expect(ttftSnapshot()?.ttft_e2e_ms).toBe(500)

      // New session resets the guard
      vi.setSystemTime(2000)
      ttftBegin()

      ttftReport('new session')

      expect(consoleSpy).toHaveBeenCalledTimes(2)
      expect(consoleSpy).toHaveBeenLastCalledWith({
        'reason': 'new session',
        'β−α attachments': '—',
        'γ−β refreshTools': '—',
        'δ−γ createModel': '—',
        'ε−δ first IPC chunk': '—',
        'ζ−ε proxy→upstream': '—',
        'η−ζ backend TTFT': '—',
        'θ−α total visible': '—',
        'θ−η UI after stream': '—',
      })
    })
  })
})
