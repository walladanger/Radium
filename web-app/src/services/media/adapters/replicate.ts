import { MEDIA_CONTRACT_VERSION, MEDIA_TASK } from '../contract'
import type {
  MediaCapabilities,
  MediaJobHandle,
  MediaJobSnapshot,
  MediaOutputRef,
  MediaParamSpec,
  MediaProviderAdapter,
  MediaProviderDescriptor,
  MediaProviderHealth,
  NormalizedMediaRequest,
} from '../contract'

// Shared by the Replicate models that all take the same prompt inputs, so the
// param list lives in one place instead of being repeated per model.
const PROMPT_NEGATIVE_RESOLUTION_PARAMS: MediaParamSpec[] = [
  { id: 'prompt', type: 'text', label: 'Prompt', required: true },
  { id: 'negative_prompt', type: 'text', label: 'Negative prompt' },
  { id: 'resolution', type: 'string', label: 'Resolution' },
]

export class ReplicateError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
    public readonly retryable = false
  ) {
    super(message)
    this.name = 'ReplicateError'
  }
}

export type ReplicateAdapterOptions = {
  fetch?: typeof fetch
  resolveSecret?: (key: string) => Promise<string | undefined>
}

type ReplicatePredictionResponse = {
  id: string
  model: string
  version: string
  input: Record<string, unknown>
  logs: string
  error: string | null
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  created_at: string
  urls: {
    get: string
    cancel: string
  }
  output?: string[] | string
}

export function createReplicateAdapter(
  descriptor: MediaProviderDescriptor,
  options: ReplicateAdapterOptions = {}
): MediaProviderAdapter {
  const base = (descriptor.base_url ?? 'https://api.replicate.com/v1').replace(
    /\/+$/,
    ''
  )
  const transport = options.fetch ?? fetch
  const resolveSecret = options.resolveSecret

  async function authorization(): Promise<Record<string, string>> {
    const settingKey = descriptor.auth?.setting_key
    if (!descriptor.auth || descriptor.auth.type === 'none') return {}
    if (!settingKey || !resolveSecret) {
      throw new ReplicateError(
        `Provider "${descriptor.label}" has no API key configured.`,
        'no_api_key'
      )
    }

    const secret = await resolveSecret(settingKey)
    if (!secret) {
      throw new ReplicateError(
        `Provider "${descriptor.label}" has no API key configured.`,
        'no_api_key'
      )
    }

    return { Authorization: `Bearer ${secret}` }
  }

  async function errorFor(response: Response): Promise<ReplicateError> {
    let message = `The provider answered ${response.status}.`
    try {
      const payload = await response.json()
      if (payload && payload.detail) message = String(payload.detail)
    } catch {
      // Ignored
    }

    const retryable = response.status === 429 || response.status >= 500
    return new ReplicateError(
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
        const response = await transport(`${base}/account`, {
          headers: { ...(await authorization()) },
          signal,
        })
        if (response.status === 401 || response.status === 403) {
          return {
            state: 'unauthorised',
            detail: (await errorFor(response)).message,
          }
        }
        if (!response.ok) {
          return {
            state: 'offline',
            detail: (await errorFor(response)).message,
          }
        }
        return { state: 'online', service: 'Replicate' }
      } catch (error) {
        if (error instanceof ReplicateError && error.code === 'no_api_key') {
          return { state: 'unauthorised', detail: error.message }
        }
        return {
          state: 'offline',
          detail: error instanceof Error ? error.message : String(error),
        }
      }
    },

    async capabilities(signal?: AbortSignal): Promise<MediaCapabilities> {
      void signal
      return {
        contract_version: MEDIA_CONTRACT_VERSION,
        provider_id: descriptor.id,
        devices: [],
        models: [
          {
            id: `${descriptor.id}:black-forest-labs/flux-schnell`,
            local_id: 'black-forest-labs/flux-schnell',
            provider_id: descriptor.id,
            label: 'Flux Schnell (Replicate)',
            tasks: [MEDIA_TASK.TEXT_TO_IMAGE],
            params: {
              [MEDIA_TASK.TEXT_TO_IMAGE]: PROMPT_NEGATIVE_RESOLUTION_PARAMS,
            },
            outputs: { [MEDIA_TASK.TEXT_TO_IMAGE]: { media_type: 'image' } },
            install: { installed: true, installable: false },
          },
          {
            id: `${descriptor.id}:tencent/hunyuan-video`,
            local_id: 'tencent/hunyuan-video',
            provider_id: descriptor.id,
            label: 'Hunyuan Video (Replicate)',
            tasks: [MEDIA_TASK.TEXT_TO_VIDEO],
            params: {
              [MEDIA_TASK.TEXT_TO_VIDEO]: PROMPT_NEGATIVE_RESOLUTION_PARAMS,
            },
            outputs: { [MEDIA_TASK.TEXT_TO_VIDEO]: { media_type: 'video' } },
            install: { installed: true, installable: false },
          },
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
          },
        ],
        features: {
          cancel: true,
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
      if (req.params.resolution) {
        const [width, height] = (req.params.resolution as string)
          .split('x')
          .map(Number)
        input.width = width
        input.height = height
      }
      if (req.params.negative_prompt)
        input.negative_prompt = req.params.negative_prompt

      const response = await transport(
        `${base}/models/${localId}/predictions`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ input }),
          signal,
        }
      )

      if (!response.ok) throw await errorFor(response)

      const payload = (await response.json()) as ReplicatePredictionResponse

      return snapshotOf(
        { client_job_id: req.client_job_id },
        payload.id,
        payload.status === 'starting' ? 'running' : 'queued'
      )
    },

    async poll(handle: MediaJobHandle): Promise<MediaJobSnapshot> {
      if (!handle.provider_job_id) {
        throw new ReplicateError(
          `No generation is in flight for client job "${handle.client_job_id}".`,
          'unknown_job'
        )
      }

      const response = await transport(
        `${base}/predictions/${handle.provider_job_id}`,
        {
          headers: { ...(await authorization()) },
        }
      )
      if (!response.ok) throw await errorFor(response)

      const payload = (await response.json()) as ReplicatePredictionResponse

      if (payload.status === 'failed') {
        return snapshotOf(handle, payload.id, 'failed', {
          error: {
            code: 'provider_error',
            message: payload.error || 'Generation failed',
            retryable: false,
          },
        })
      }
      if (payload.status === 'canceled') {
        return snapshotOf(handle, payload.id, 'cancelled')
      }
      if (payload.status === 'succeeded') {
        const out = Array.isArray(payload.output)
          ? payload.output
          : [payload.output]
        const refs: MediaOutputRef[] = out.filter(Boolean).map((url) => ({
          kind: 'url',
          url: url as string,
        }))
        return snapshotOf(handle, payload.id, 'succeeded', {
          progress: 100,
          outputs: refs,
        })
      }

      return snapshotOf(
        handle,
        payload.id,
        payload.status === 'starting' || payload.status === 'processing'
          ? 'running'
          : 'queued'
      )
    },

    async cancel(handle: MediaJobHandle): Promise<void> {
      if (!handle.provider_job_id) return
      try {
        await transport(
          `${base}/predictions/${handle.provider_job_id}/cancel`,
          {
            method: 'POST',
            headers: { ...(await authorization()) },
          }
        )
      } catch {
        // Ignored
      }
    },
  }
}
