import { describe, expect, it, vi } from 'vitest'

import { MEDIA_TASK } from '../../contract'
import { A1111Error, createA1111Adapter } from '../a1111'

const descriptor = {
  id: 'a1111',
  label: 'Automatic1111',
  kind: 'local_worker',
  adapter: 'a1111',
  enabled: true,
} as const

function request(
  overrides: Partial<{
    task: string
    params: Record<string, unknown>
  }> = {}
) {
  return {
    client_job_id: 'client-job-1',
    provider_id: descriptor.id,
    model_id: `${descriptor.id}:model-a`,
    task: MEDIA_TASK.TEXT_TO_IMAGE,
    params: { prompt: 'A lighthouse' },
    ...overrides,
  }
}

describe('createA1111Adapter', () => {
  it('returns discovered models', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([{ title: 'Model A', model_name: 'model-a' }]),
    })

    const adapter = createA1111Adapter(descriptor as never, {
      fetch: fetchMock as never,
    })

    const capabilities = await adapter.capabilities()
    expect(capabilities.models).toHaveLength(1)
    expect(capabilities.models[0].local_id).toBe('model-a')
  })

  it('propagates checkpoint switch network and HTTP failures', async () => {
    const networkFailure = new Error('connection lost')
    const networkAdapter = createA1111Adapter(descriptor as never, {
      fetch: vi.fn().mockRejectedValue(networkFailure) as never,
    })

    await expect(networkAdapter.submit(request())).rejects.toBe(networkFailure)

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ detail: 'checkpoint unavailable' }),
    })
    const rejectedAdapter = createA1111Adapter(descriptor as never, {
      fetch: fetchMock as never,
    })

    await expect(rejectedAdapter.submit(request())).rejects.toMatchObject({
      name: 'A1111Error',
      code: 'http_409',
      message: 'checkpoint unavailable',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects image-to-image requests without a data URL', async () => {
    const fetchMock = vi.fn()
    const adapter = createA1111Adapter(descriptor as never, {
      fetch: fetchMock as never,
    })

    await expect(
      adapter.submit(
        request({
          task: MEDIA_TASK.IMAGE_TO_IMAGE,
          params: { prompt: 'Restyle this', init_image: '/tmp/image.png' },
        })
      )
    ).rejects.toMatchObject({
      name: 'A1111Error',
      code: 'invalid_params',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('routes valid image-to-image requests to img2img', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/options')) return Promise.resolve({ ok: true })
      if (url.endsWith('/img2img')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ images: ['image'] }),
        })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    const adapter = createA1111Adapter(descriptor as never, {
      fetch: fetchMock as never,
    })

    const submitted = await adapter.submit(
      request({
        task: MEDIA_TASK.IMAGE_TO_IMAGE,
        params: {
          prompt: 'Restyle this',
          init_image: 'data:image/png;base64,aW1hZ2U=',
        },
      })
    )
    expect(submitted.state).toBe('queued')

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/img2img$/),
        expect.objectContaining({
          body: expect.stringContaining('"init_images":["aW1hZ2U="]'),
        })
      )
    })
  })

  it('queues before generation resolves and reports asynchronous HTTP errors', async () => {
    let resolveGeneration!: (value: unknown) => void
    const generation = new Promise((resolve) => {
      resolveGeneration = resolve
    })
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/options')) return Promise.resolve({ ok: true })
      if (url.endsWith('/txt2img')) return generation
      throw new Error(`Unexpected URL: ${url}`)
    })
    const adapter = createA1111Adapter(descriptor as never, {
      fetch: fetchMock as never,
    })

    const submitted = await adapter.submit(request())
    expect(submitted.state).toBe('queued')

    resolveGeneration({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ detail: 'bad prompt' }),
    })

    await vi.waitFor(async () => {
      await expect(adapter.poll(submitted)).resolves.toMatchObject({
        state: 'failed',
        error: {
          message: 'bad prompt',
          retryable: false,
        },
      })
    })
  })

  it('interrupts only pending known jobs and removes them after success', async () => {
    const generation = new Promise(() => {})
    let interruptOk = false
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/options')) return Promise.resolve({ ok: true })
      if (url.endsWith('/txt2img')) return generation
      if (url.endsWith('/interrupt')) {
        return Promise.resolve({
          ok: interruptOk,
          status: interruptOk ? 200 : 503,
          json: () => Promise.resolve({ detail: 'busy' }),
        })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    const adapter = createA1111Adapter(descriptor as never, {
      fetch: fetchMock as never,
    })

    await adapter.cancel?.({ client_job_id: 'unknown' })
    expect(fetchMock).not.toHaveBeenCalled()

    const submitted = await adapter.submit(request())
    await expect(adapter.cancel?.(submitted)).rejects.toBeInstanceOf(A1111Error)

    interruptOk = true
    await expect(adapter.cancel?.(submitted)).resolves.toBeUndefined()
    await expect(adapter.poll(submitted)).rejects.toMatchObject({
      code: 'unknown_job',
    })
  })
})
