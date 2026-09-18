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

export class StabilityAiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
    public readonly retryable = false
  ) {
    super(message)
    this.name = 'StabilityAiError'
  }
}

export type StabilityAiAdapterOptions = {
  fetch?: typeof fetch
  resolveSecret?: (key: string) => Promise<string | undefined>
}

export function createStabilityAiAdapter(
  descriptor: MediaProviderDescriptor,
  options: StabilityAiAdapterOptions = {}
): MediaProviderAdapter {
  const base = (descriptor.base_url ?? 'https://api.stability.ai/v2beta/stable-image').replace(
    /\/+$/,
    ''
  )
  const transport = options.fetch ?? fetch
  const resolveSecret = options.resolveSecret

  async function authorization(): Promise<Record<string, string>> {
    const settingKey = descriptor.auth?.setting_key
    if (!descriptor.auth || descriptor.auth.type === 'none') return {}
    if (!settingKey || !resolveSecret) {
      throw new StabilityAiError(
        `Provider "${descriptor.label}" has no API key configured.`,
        'no_api_key'
      )
    }

    const secret = await resolveSecret(settingKey)
    if (!secret) {
      throw new StabilityAiError(
        `Provider "${descriptor.label}" has no API key configured.`,
        'no_api_key'
      )
    }

    return { Authorization: `Bearer ${secret}`, Accept: 'application/json' }
  }

  async function errorFor(response: Response): Promise<StabilityAiError> {
    let message = `The provider answered ${response.status}.`
    try {
      const payload = await response.json()
      if (payload && payload.message) message = String(payload.message)
    } catch {
        // Ignored
    }

    const retryable = response.status === 429 || response.status >= 500
    return new StabilityAiError(
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
      return { state: 'online', service: 'Stability AI' }
    },

    async capabilities(signal?: AbortSignal): Promise<MediaCapabilities> {
      void signal
      return {
        contract_version: MEDIA_CONTRACT_VERSION,
        provider_id: descriptor.id,
        devices: [],
        models: [
            {
                id: `${descriptor.id}:core`,
                local_id: 'core',
                provider_id: descriptor.id,
                label: 'Stable Image Core',
                tasks: [MEDIA_TASK.TEXT_TO_IMAGE], params: { [MEDIA_TASK.TEXT_TO_IMAGE]: [] }, outputs: { [MEDIA_TASK.TEXT_TO_IMAGE]: { media_type: "image" } }, install: { installed: true, installable: false }
            },
            {
                id: `${descriptor.id}:ultra`,
                local_id: 'ultra',
                provider_id: descriptor.id,
                label: 'Stable Image Ultra',
                tasks: [MEDIA_TASK.TEXT_TO_IMAGE], params: { [MEDIA_TASK.TEXT_TO_IMAGE]: [] }, outputs: { [MEDIA_TASK.TEXT_TO_IMAGE]: { media_type: "image" } }, install: { installed: true, installable: false }
            }
        ],
        tasks: [
          {
            id: MEDIA_TASK.TEXT_TO_IMAGE,
            label_key: `media:task.${MEDIA_TASK.TEXT_TO_IMAGE}`,
            output_media_type: 'image',
          }
        ],
        features: {
          cancel: false,
          events: false,
          progress: false,
          queue: false,
          install: false,
          batch: false,
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
        ...(await authorization()),
      }

      const formData = new FormData()
      formData.append('prompt', req.params.prompt as string)
      if (req.params.negative_prompt) formData.append('negative_prompt', req.params.negative_prompt as string)

      const response = await transport(`${base}/generate/${localId}`, {
        method: 'POST',
        headers,
        body: formData as unknown as BodyInit,
        signal,
      })

      if (!response.ok) throw await errorFor(response)
      const payload = await response.json()

      const refs: MediaOutputRef[] = [{
          kind: 'inline',
          base64: payload.image,
          mime: 'image/png'
      }]

      return snapshotOf(
        { client_job_id: req.client_job_id },
        req.client_job_id,
        'succeeded',
        { outputs: refs, progress: 100 }
      )
    },

    async poll(handle: MediaJobHandle): Promise<MediaJobSnapshot> {
      // Synchronous generation returns complete data in submit
      return snapshotOf(handle, handle.provider_job_id || handle.client_job_id, 'succeeded', { progress: 100 })
    },

  }
}
