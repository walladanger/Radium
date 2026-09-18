import { describe, expect, it, vi } from 'vitest'
import { createReplicateAdapter } from '../replicate'
import { createFalAiAdapter } from '../falAi'
import { createStabilityAiAdapter } from '../stabilityAi'

describe('Cloud providers', () => {
  const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
  })

  it('creates Replicate adapter', () => {
      const adapter = createReplicateAdapter({ id: 'replicate', label: 'Replicate', kind: 'cloud', adapter: 'replicate', enabled: true }, { fetch: fetchMock as any })
      expect(adapter).toBeDefined()
  })

  it('creates FalAi adapter', () => {
      const adapter = createFalAiAdapter({ id: 'fal', label: 'fal.ai', kind: 'cloud', adapter: 'fal-ai', enabled: true }, { fetch: fetchMock as any })
      expect(adapter).toBeDefined()
  })

  it('creates StabilityAi adapter', () => {
      const adapter = createStabilityAiAdapter({ id: 'stability', label: 'Stability', kind: 'cloud', adapter: 'stability-ai', enabled: true }, { fetch: fetchMock as any })
      expect(adapter).toBeDefined()
  })
})
