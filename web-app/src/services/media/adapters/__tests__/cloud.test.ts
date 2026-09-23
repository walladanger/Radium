import { describe, expect, it, vi } from 'vitest'

import { MEDIA_TASK, validateParams } from '../../contract'
import { createFalAiAdapter } from '../falAi'
import { createReplicateAdapter } from '../replicate'
import { createStabilityAiAdapter } from '../stabilityAi'

const falDescriptor = {
  id: 'fal',
  label: 'fal.ai',
  kind: 'cloud',
  adapter: 'fal-ai',
  enabled: true,
  auth: { type: 'api_key', setting_key: 'fal-key' },
} as const

const stabilityDescriptor = {
  id: 'stability',
  label: 'Stability AI',
  kind: 'cloud',
  adapter: 'stability-ai',
  enabled: true,
  auth: { type: 'bearer', setting_key: 'stability-key' },
} as const

describe('Cloud providers', () => {
  it('maps missing fal.ai and Stability AI credentials to unauthorised', async () => {
    const fetchMock = vi.fn()
    const fal = createFalAiAdapter(falDescriptor as never, {
      fetch: fetchMock as never,
      resolveSecret: async () => undefined,
    })
    const stability = createStabilityAiAdapter(stabilityDescriptor as never, {
      fetch: fetchMock as never,
      resolveSecret: async () => undefined,
    })

    await expect(fal.health()).resolves.toMatchObject({
      state: 'unauthorised',
      detail: expect.stringContaining('no API key'),
    })
    await expect(stability.health()).resolves.toMatchObject({
      state: 'unauthorised',
      detail: expect.stringContaining('no API key'),
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('declares every parameter consumed by the cloud adapters', async () => {
    const noAuth = { auth: { type: 'none' } }
    const fal = createFalAiAdapter({ ...falDescriptor, ...noAuth } as never)
    const replicate = createReplicateAdapter({
      id: 'replicate',
      label: 'Replicate',
      kind: 'cloud',
      adapter: 'replicate',
      enabled: true,
      ...noAuth,
    } as never)
    const stability = createStabilityAiAdapter({
      ...stabilityDescriptor,
      ...noAuth,
    } as never)

    for (const model of (await fal.capabilities()).models) {
      const specs = model.params[model.tasks[0]]
      expect(validateParams(specs, { prompt: 'Retained' }).values).toEqual({
        prompt: 'Retained',
      })
    }

    for (const model of (await replicate.capabilities()).models) {
      const specs = model.params[model.tasks[0]]
      expect(
        validateParams(specs, {
          prompt: 'Retained',
          negative_prompt: 'Also retained',
          resolution: '1024x1024',
        }).values
      ).toEqual({
        prompt: 'Retained',
        negative_prompt: 'Also retained',
        resolution: '1024x1024',
      })
    }

    for (const model of (await stability.capabilities()).models) {
      const specs = model.params[model.tasks[0]]
      expect(
        validateParams(specs, {
          prompt: 'Retained',
          negative_prompt: 'Also retained',
        }).values
      ).toEqual({
        prompt: 'Retained',
        negative_prompt: 'Also retained',
      })
    }
  })

  it('polls fal.ai with its model path and maps queue, progress, and outputs', async () => {
    const status = ['IN_QUEUE', 'IN_PROGRESS', 'COMPLETED']
    const signals: Array<AbortSignal | undefined> = []
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      signals.push(init?.signal ?? undefined)
      if (url.endsWith('/fal-ai/flux/schnell')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ request_id: 'request-1' }),
        })
      }
      if (url.endsWith('/requests/request-1/status')) {
        const next = status.shift()
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              status: next,
              queue_position: next === 'IN_QUEUE' ? 2 : undefined,
            }),
        })
      }
      if (url.endsWith('/requests/request-1')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              images: [{ url: 'https://example.test/image.png' }],
              video: { url: 'https://example.test/video.mp4' },
            }),
        })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    const adapter = createFalAiAdapter(falDescriptor as never, {
      fetch: fetchMock as never,
      resolveSecret: async () => 'secret',
    })
    const submitted = await adapter.submit({
      client_job_id: 'client-job-1',
      provider_id: falDescriptor.id,
      model_id: `${falDescriptor.id}:fal-ai/flux/schnell`,
      task: MEDIA_TASK.TEXT_TO_IMAGE,
      params: { prompt: 'A lighthouse' },
    })
    expect(JSON.parse(submitted.provider_job_id ?? '')).toEqual({
      model: 'fal-ai/flux/schnell',
      requestId: 'request-1',
    })

    await expect(adapter.poll(submitted)).resolves.toMatchObject({
      state: 'queued',
      queue_position: 2,
    })
    await expect(adapter.poll(submitted)).resolves.toMatchObject({
      state: 'running',
    })

    const controller = new AbortController()
    await expect(
      adapter.poll(submitted, controller.signal)
    ).resolves.toMatchObject({
      state: 'succeeded',
      outputs: [
        { kind: 'url', url: 'https://example.test/image.png' },
        { kind: 'url', url: 'https://example.test/video.mp4' },
      ],
    })
    expect(signals.slice(-2)).toEqual([controller.signal, controller.signal])
  })

  it('returns Stability AI synchronous results only for known handles', async () => {
    const adapter = createStabilityAiAdapter(stabilityDescriptor as never, {
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ image: 'base64-image' }),
      }) as never,
      resolveSecret: async () => 'secret',
    })

    await expect(
      adapter.poll({ client_job_id: 'unknown' })
    ).rejects.toMatchObject({ code: 'unknown_job' })

    const submitted = await adapter.submit({
      client_job_id: 'client-job-1',
      provider_id: stabilityDescriptor.id,
      model_id: `${stabilityDescriptor.id}:core`,
      task: MEDIA_TASK.TEXT_TO_IMAGE,
      params: { prompt: 'A lighthouse' },
    })
    await expect(adapter.poll(submitted)).resolves.toEqual(submitted)
  })
})
