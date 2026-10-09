import { describe, expect, it, vi } from 'vitest'
import { createA1111Adapter } from '../a1111'

describe('createA1111Adapter', () => {
  it('returns a functioning adapter', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ title: 'Model A', model_name: 'model-a' }])
    })

    const adapter = createA1111Adapter(
      { id: 'a1111', label: 'Automatic1111', kind: 'local_worker', adapter: 'a1111', enabled: true },
      { fetch: fetchMock as any }
    )

    expect(adapter).toBeDefined()

    const capabilities = await adapter.capabilities!()
    expect(capabilities.models).toHaveLength(1)
    expect(capabilities.models[0].local_id).toBe('model-a')
  })
})
