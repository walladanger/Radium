import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createReplicateAdapter } from '../replicate'
import { createFalAiAdapter } from '../falAi'
import { createStabilityAiAdapter } from '../stabilityAi'

describe('Cloud providers', () => {
  const fetchMock = vi.fn()
  const resolveSecret = vi.fn().mockResolvedValue('test-secret')
  const req = { client_job_id: 'job-1', model_id: 'model-1', task: 'text-to-image' as any, params: { prompt: 'test' } }
  const reqVideo = { client_job_id: 'job-1', model_id: 'model-1', task: 'text-to-video' as any, params: { prompt: 'test' } }

  beforeEach(() => {
    fetchMock.mockReset()
    resolveSecret.mockClear()
  })

  it('exercises Replicate adapter', async () => {
      fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'p-1', status: 'queued' })
      })
      fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'p-1', status: 'succeeded', output: ['https://example.com/img.png'] })
      })

      const adapter = createReplicateAdapter({
          id: 'replicate', label: 'Replicate', kind: 'cloud', adapter: 'replicate', enabled: true,
          auth: { type: 'setting', setting_key: 'rep-key', label: 'key', help_url: '' }
      }, { fetch: fetchMock as any, resolveSecret })

      const submitSnap = await adapter.submit(req)
      expect(submitSnap.state).toBe('queued')
      expect(submitSnap.provider_job_id).toBe('p-1')
      expect(fetchMock).toHaveBeenCalledWith('https://api.replicate.com/v1/models/model-1/predictions', expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer test-secret' }),
          body: JSON.stringify({ input: { prompt: 'test' } })
      }))

      const pollSnap = await adapter.poll({ client_job_id: 'job-1', provider_job_id: submitSnap.provider_job_id })
      expect(pollSnap.state).toBe('succeeded')
      expect(pollSnap.outputs).toEqual([{ kind: 'url', url: 'https://example.com/img.png' }])
  })

  it('exercises FalAi adapter', async () => {
      fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ request_id: 'req-1' })
      })
      fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'IN_QUEUE' })
      })
      fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'IN_PROGRESS' })
      })
      fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'COMPLETED' })
      })
      fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ images: [{ url: 'https://example.com/img.png', content_type: 'image/png' }] })
      })

      const adapter = createFalAiAdapter({
          id: 'fal', label: 'fal.ai', kind: 'cloud', adapter: 'fal-ai', enabled: true,
          auth: { type: 'setting', setting_key: 'fal-key', label: 'key', help_url: '' }
      }, { fetch: fetchMock as any, resolveSecret })

      const submitSnap = await adapter.submit(req)
      expect(submitSnap.state).toBe('queued')
      expect(submitSnap.provider_job_id).toBe('model-1:req-1')
      expect(fetchMock).toHaveBeenCalledWith('https://queue.fal.run/model-1', expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Key test-secret' }),
          body: JSON.stringify({ prompt: 'test' })
      }))

      const pollSnap1 = await adapter.poll({ client_job_id: 'job-1', provider_job_id: submitSnap.provider_job_id })
      expect(pollSnap1.state).toBe('queued')

      const pollSnap2 = await adapter.poll({ client_job_id: 'job-1', provider_job_id: submitSnap.provider_job_id })
      expect(pollSnap2.state).toBe('running')

      const pollSnap3 = await adapter.poll({ client_job_id: 'job-1', provider_job_id: submitSnap.provider_job_id })
      expect(pollSnap3.state).toBe('succeeded')
      expect(pollSnap3.outputs).toEqual([{ kind: 'url', url: 'https://example.com/img.png', mime: 'image/png' }])

      expect(fetchMock).toHaveBeenCalledWith('https://queue.fal.run/model-1/requests/req-1/status', expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Key test-secret' })
      }))
      expect(fetchMock).toHaveBeenCalledWith('https://queue.fal.run/model-1/requests/req-1', expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Key test-secret' })
      }))
  })

  it('exercises StabilityAi adapter', async () => {
      fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ image: 'base64-data', seed: 123, finish_reason: 'SUCCESS' })
      })

      const adapter = createStabilityAiAdapter({
          id: 'stability', label: 'Stability', kind: 'cloud', adapter: 'stability-ai', enabled: true,
          auth: { type: 'setting', setting_key: 'stab-key', label: 'key', help_url: '' }
      }, { fetch: fetchMock as any, resolveSecret })

      const submitSnap = await adapter.submit(req)
      expect(submitSnap.state).toBe('succeeded')
      expect(submitSnap.outputs).toEqual([{ kind: 'inline', base64: 'base64-data', mime: 'image/png' }])
      expect(fetchMock).toHaveBeenCalledWith('https://api.stability.ai/v2beta/stable-image/generate/model-1', expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer test-secret' })
      }))

      // poll should throw unknown_job
      await expect(adapter.poll({ client_job_id: 'job-1', provider_job_id: submitSnap.provider_job_id })).rejects.toThrow(/No generation is in flight/)
  })
})
