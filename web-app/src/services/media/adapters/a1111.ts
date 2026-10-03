import { MEDIA_CONTRACT_VERSION, MEDIA_TASK } from '../contract'

import type {
  MediaCapabilities,
  MediaJobHandle,
  MediaJobSnapshot,
  MediaOutputRef,
  MediaProviderAdapter,
  MediaProviderDescriptor,
  MediaProviderHealth,
  NormalizedMediaRequest,
} from '../contract'

export class A1111Error extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
    public readonly retryable = false
  ) {
    super(message)
    this.name = 'A1111Error'
  }
}

/** One in-flight generation. A1111 provides progress, so we poll it. */
type Pending = {
  providerJobId: string
  status: 'pending' | 'resolved' | 'rejected'
  payload?: A1111ImagesResponse
  reason?: unknown
  settled?: MediaJobSnapshot
}

type A1111ImagesResponse = {
  images: string[]
  parameters: Record<string, unknown>
  info: string
}

export type A1111AdapterOptions = {
  fetch?: typeof fetch
}

const isDataUrl = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('data:')

export function createA1111Adapter(
  descriptor: MediaProviderDescriptor,
  options: A1111AdapterOptions = {}
): MediaProviderAdapter {
  const base = (descriptor.base_url ?? 'http://127.0.0.1:7860').replace(
    /\/+$/,
    ''
  )
  const transport = options.fetch ?? fetch
  const pending = new Map<string, Pending>()

  async function authorization(): Promise<Record<string, string>> {
    return {}
  }

  async function errorFor(response: Response): Promise<A1111Error> {
    let message = `The provider answered ${response.status}.`
    try {
      const payload = await response.json()
      if (payload && payload.detail) message = String(payload.detail)
    } catch {
      // Ignored
    }

    const retryable = response.status === 429 || response.status >= 500
    return new A1111Error(
      message,
      `http_${response.status}`,
      response.status,
      retryable
    )
  }

  function snapshotOf(
    handle: MediaJobHandle,
    providerJobId: string,
    state: MediaJobSnapshot['state'],
    extra: Partial<MediaJobSnapshot> = {}
  ): MediaJobSnapshot {
    return {
      client_job_id: handle.client_job_id,
      provider_job_id: providerJobId,
      provider_id: descriptor.id,
      state,
      progress: null,
      step: null,
      queue_position: null,
      outputs: [],
      error: null,
      ...extra,
    }
  }

  return {
    descriptor,

    async health(signal?: AbortSignal): Promise<MediaProviderHealth> {
      try {
        const response = await transport(`${base}/sdapi/v1/sd-models`, {
          headers: { ...(await authorization()) },
          signal,
        })
        if (!response.ok) {
          return {
            state: 'offline',
            detail: (await errorFor(response)).message,
          }
        }
        return { state: 'online', service: 'Automatic1111' }
      } catch (error) {
        return {
          state: 'offline',
          detail: error instanceof Error ? error.message : String(error),
        }
      }
    },

    async capabilities(signal?: AbortSignal): Promise<MediaCapabilities> {
      let models: { title: string; model_name: string }[] = []
      try {
        const response = await transport(`${base}/sdapi/v1/sd-models`, {
          headers: { ...(await authorization()) },
          signal,
        })
        if (response.ok) models = await response.json()
      } catch {
        // Ignored
      }

      return {
        contract_version: MEDIA_CONTRACT_VERSION,
        provider_id: descriptor.id,
        devices: [],
        models: models.map((m) => ({
          id: `${descriptor.id}:${m.model_name}`,
          local_id: m.model_name,
          provider_id: descriptor.id,
          label: m.title,
          tasks: [MEDIA_TASK.TEXT_TO_IMAGE, MEDIA_TASK.IMAGE_TO_IMAGE],
          params: {
            [MEDIA_TASK.TEXT_TO_IMAGE]: [],
            [MEDIA_TASK.IMAGE_TO_IMAGE]: [],
          },
          outputs: {
            [MEDIA_TASK.TEXT_TO_IMAGE]: { media_type: 'image' },
            [MEDIA_TASK.IMAGE_TO_IMAGE]: { media_type: 'image' },
          },
          install: { installed: true, installable: false },
        })),
        tasks: [
          {
            id: MEDIA_TASK.TEXT_TO_IMAGE,
            label_key: `media:task.${MEDIA_TASK.TEXT_TO_IMAGE}`,
            output_media_type: 'image',
          },
          {
            id: MEDIA_TASK.IMAGE_TO_IMAGE,
            label_key: `media:task.${MEDIA_TASK.IMAGE_TO_IMAGE}`,
            output_media_type: 'image',
          },
        ],
        features: {
          cancel: true,
          events: false,
          progress: true,
          queue: false,
          install: false,
          batch: true,
          synchronous: true,
        },
      }
    },

    async submit(
      req: NormalizedMediaRequest,
      signal?: AbortSignal
    ): Promise<MediaJobSnapshot> {
      const localId = req.model_id.startsWith(`${descriptor.id}:`)
        ? req.model_id.slice(descriptor.id.length + 1)
        : req.model_id

      if (
        req.task === MEDIA_TASK.IMAGE_TO_IMAGE &&
        !isDataUrl(req.params.init_image)
      ) {
        throw new A1111Error(
          'Image-to-image generation requires init_image to be a data URL.',
          'invalid_params'
        )
      }

      const headers = {
        'content-type': 'application/json',
        ...(await authorization()),
      }

      const switchResponse = await transport(`${base}/sdapi/v1/options`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sd_model_checkpoint: localId }),
        signal,
      })
      if (!switchResponse.ok) throw await errorFor(switchResponse)

      const isImg2Img = req.task === MEDIA_TASK.IMAGE_TO_IMAGE
      const route = isImg2Img ? '/sdapi/v1/img2img' : '/sdapi/v1/txt2img'

      let width, height
      if (typeof req.params.resolution === 'string') {
        const resolution = req.params.resolution.split('x').map(Number)
        width = resolution[0]
        height = resolution[1]
      }

      const body: Record<string, unknown> = {
        prompt: req.params.prompt,
        negative_prompt: req.params.negative_prompt,
        steps: req.params.steps,
        cfg_scale: req.params.guidance_scale,
        seed: typeof req.params.seed === 'number' ? req.params.seed : -1,
        width: width,
        height: height,
        batch_size: 1,
      }

      if (isImg2Img) {
        body.init_images = [(req.params.init_image as string).split(',')[1]]
        if (typeof req.params.strength === 'number') {
          body.denoising_strength = req.params.strength
        }
      }

      const providerJobId = req.client_job_id
      const entry: Pending = { providerJobId, status: 'pending' }
      pending.set(req.client_job_id, entry)

      void Promise.resolve()
        .then(() =>
          transport(`${base}${route}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal,
          })
        )
        .then(async (response) => {
          if (!response.ok) throw await errorFor(response)
          return (await response.json()) as A1111ImagesResponse
        })
        .then(
          (payload) => {
            entry.status = 'resolved'
            entry.payload = payload
          },
          (reason: unknown) => {
            entry.status = 'rejected'
            entry.reason = reason
          }
        )

      return snapshotOf(
        { client_job_id: req.client_job_id },
        providerJobId,
        'queued'
      )
    },

    async poll(handle: MediaJobHandle): Promise<MediaJobSnapshot> {
      const entry = pending.get(handle.client_job_id)
      if (!entry) {
        throw new A1111Error(
          `No generation is in flight for client job "${handle.client_job_id}".`,
          'unknown_job'
        )
      }
      if (entry.settled) return entry.settled

      if (entry.status === 'pending') {
        try {
          const res = await transport(`${base}/sdapi/v1/progress`)
          if (res.ok) {
            const prog = await res.json()
            return snapshotOf(handle, entry.providerJobId, 'running', {
              progress: prog.progress ? Math.round(prog.progress * 100) : null,
            })
          }
        } catch {
          // Ignored
        }
        return snapshotOf(handle, entry.providerJobId, 'running')
      }

      if (entry.status === 'rejected') {
        const settled = snapshotOf(handle, entry.providerJobId, 'failed', {
          error: {
            code: 'transport_error',
            message:
              entry.reason instanceof Error
                ? entry.reason.message
                : String(entry.reason),
            retryable:
              entry.reason instanceof A1111Error
                ? entry.reason.retryable
                : true,
          },
        })
        entry.settled = settled
        return settled
      }

      const refs: MediaOutputRef[] = (entry.payload?.images ?? []).map(
        (b64) => ({
          kind: 'inline',
          base64: b64,
          mime: 'image/png',
        })
      )

      const settled =
        refs.length > 0
          ? snapshotOf(handle, entry.providerJobId, 'succeeded', {
              progress: 100,
              outputs: refs,
            })
          : snapshotOf(handle, entry.providerJobId, 'failed', {
              error: {
                code: 'empty_response',
                message:
                  'The provider returned no image. Its `images` array was absent or empty.',
                retryable: true,
              },
            })

      entry.settled = settled
      return settled
    },

    async cancel(handle: MediaJobHandle): Promise<void> {
      const entry = pending.get(handle.client_job_id)
      if (!entry || entry.status !== 'pending') return

      const response = await transport(`${base}/sdapi/v1/interrupt`, {
        method: 'POST',
      })
      if (!response.ok) throw await errorFor(response)

      pending.delete(handle.client_job_id)
    },
  }
}
