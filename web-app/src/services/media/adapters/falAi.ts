import { MEDIA_CONTRACT_VERSION, MEDIA_TASK } from '../contract'
import type {
  MediaCapabilities,
  MediaJobHandle,
  MediaJobSnapshot,
  MediaProviderAdapter,
  MediaProviderDescriptor,
  MediaProviderHealth,
  NormalizedMediaRequest,
} from '../contract'

export class FalAiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
    public readonly retryable = false
  ) {
    super(message)
    this.name = 'FalAiError'
  }
}

export type FalAiAdapterOptions = {
  fetch?: typeof fetch
  resolveSecret?: (key: string) => Promise<string | undefined>
}

export function createFalAiAdapter(
  descriptor: MediaProviderDescriptor,
  options: FalAiAdapterOptions = {}
): MediaProviderAdapter {
  const base = (descriptor.base_url ?? 'https://queue.fal.run').replace(
    /\/+$/,
    ''
  )
  const transport = options.fetch ?? fetch
  const resolveSecret = options.resolveSecret

  async function authorization(): Promise<Record<string, string>> {
    const settingKey = descriptor.auth?.setting_key
    if (!descriptor.auth || descriptor.auth.type === 'none') return {}
    if (!settingKey || !resolveSecret) {
      throw new FalAiError(
        `Provider "${descriptor.label}" has no API key configured.`,
        'no_api_key'
      )
    }

    const secret = await resolveSecret(settingKey)
    if (!secret) {
      throw new FalAiError(
        `Provider "${descriptor.label}" has no API key configured.`,
        'no_api_key'
      )
    }

    return { Authorization: `Key ${secret}` }
  }

  async function errorFor(response: Response): Promise<FalAiError> {
    let message = `The provider answered ${response.status}.`
    try {
      const payload = await response.json()
      if (payload && payload.detail) message = String(payload.detail)
    } catch {
        // Ignored
    }

    const retryable = response.status === 429 || response.status >= 500
    return new FalAiError(
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
      void signal
      return { state: 'online', service: 'fal.ai' }
    },

    async capabilities(signal?: AbortSignal): Promise<MediaCapabilities> {
      void signal
      return {
        contract_version: MEDIA_CONTRACT_VERSION,
        provider_id: descriptor.id,
        devices: [],
        models: [
            {
                id: `${descriptor.id}:fal-ai/flux/schnell`,
                local_id: 'fal-ai/flux/schnell',
                provider_id: descriptor.id,
                label: 'Flux Schnell (fal.ai)',
                tasks: [MEDIA_TASK.TEXT_TO_IMAGE], params: { [MEDIA_TASK.TEXT_TO_IMAGE]: [] }, outputs: { [MEDIA_TASK.TEXT_TO_IMAGE]: { media_type: "image" } }, install: { installed: true, installable: false }
            },
            {
                id: `${descriptor.id}:fal-ai/kling-video/v1/standard/text-to-video`,
                local_id: 'fal-ai/kling-video/v1/standard/text-to-video',
                provider_id: descriptor.id,
                label: 'Kling Video (fal.ai)',
                tasks: [MEDIA_TASK.TEXT_TO_VIDEO], params: { [MEDIA_TASK.TEXT_TO_VIDEO]: [] }, outputs: { [MEDIA_TASK.TEXT_TO_VIDEO]: { media_type: "video" } }, install: { installed: true, installable: false }
            }
        ],
        tasks: [
          {
            id: MEDIA_TASK.TEXT_TO_IMAGE,
            label_key: `media:task.${MEDIA_TASK.TEXT_TO_IMAGE}`,
            output_media_type: 'image',
          },
          {
            id: MEDIA_TASK.TEXT_TO_VIDEO,
            label_key: `media:task.${MEDIA_TASK.TEXT_TO_VIDEO}`,
            output_media_type: 'video',
          }
        ],
        features: {
          cancel: false,
          events: false,
          progress: false,
          queue: true,
          install: false,
          batch: true,
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

      const headers = {
        'content-type': 'application/json',
        ...(await authorization()),
      }

      const input: Record<string, unknown> = {
          prompt: req.params.prompt,
      }

      const response = await transport(`${base}/${localId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
        signal,
      })

      if (!response.ok) throw await errorFor(response)

      const payload = await response.json()

      return snapshotOf(
        { client_job_id: req.client_job_id },
        payload.request_id,
        'queued'
      )
    },

    async poll(handle: MediaJobHandle): Promise<MediaJobSnapshot> {
      if (!handle.provider_job_id) {
          throw new FalAiError(
              `No generation is in flight for client job "${handle.client_job_id}".`,
              'unknown_job'
            )
      }
      return snapshotOf(handle, handle.provider_job_id, 'running')
    },

  }
}
