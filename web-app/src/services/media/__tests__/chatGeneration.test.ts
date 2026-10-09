import { describe, expect, it } from 'vitest'

import { NoMediaModelError, resolveChatRequest } from '../chatGeneration'
import type {
  MediaCapabilities,
  MediaModelDescriptor,
  MediaProviderDescriptor,
} from '../contract'

const provider = (id: string, enabled = true): MediaProviderDescriptor => ({
  id,
  label: id,
  kind: 'local_engine',
  adapter: 'builtin-engine',
  enabled,
  origin: 'user',
})

const model = (
  id: string,
  provider_id: string,
  task = 'text_to_image'
): MediaModelDescriptor => ({
  id,
  provider_id,
  local_id: id,
  label: id,
  tasks: [task],
  params: {
    [task]: [
      { id: 'prompt', type: 'text', label: 'Prompt' },
      { id: 'steps', type: 'int', label: 'Steps', default: 4 },
    ] as never,
  },
})

const caps = (
  provider_id: string,
  models: MediaModelDescriptor[]
): MediaCapabilities => ({
  contract_version: 2,
  provider_id,
  devices: [],
  models,
})

const base = {
  providers: () => [provider('p')],
  capabilities: () => ({ p: caps('p', [model('p:a', 'p'), model('p:b', 'p')]) }),
  lastUsed: () => undefined,
  newId: () => 'job-1',
}

describe('resolveChatRequest', () => {
  it('uses the last used model and settings with the new prompt', () => {
    const { request } = resolveChatRequest('text_to_image', 'a cat', {
      ...base,
      lastUsed: () => ({
        provider_id: 'p',
        model_id: 'p:b',
        params: { steps: 30, width: 512 },
        device: 'gpu0',
      }),
    })
    expect(request).toMatchObject({
      model_id: 'p:b',
      device: 'gpu0',
      params: { steps: 30, width: 512, prompt: 'a cat' },
    })
  })

  it('falls back to the first model and its defaults when none was used', () => {
    const { request } = resolveChatRequest('text_to_image', 'a cat', base)
    expect(request.model_id).toBe('p:a')
    expect(request.params).toEqual({ steps: 4, prompt: 'a cat' })
  })

  it('ignores a remembered model that is no longer available', () => {
    const { request } = resolveChatRequest('text_to_image', 'x', {
      ...base,
      lastUsed: () => ({ provider_id: 'p', model_id: 'gone', params: { steps: 99 } }),
    })
    expect(request.model_id).toBe('p:a')
    expect(request.params.steps).toBe(4)
  })

  it('says what to do when nothing can make the media', () => {
    expect(() =>
      resolveChatRequest('text_to_video', 'x', base)
    ).toThrow(NoMediaModelError)
    expect(() =>
      resolveChatRequest('text_to_image', 'x', {
        ...base,
        providers: () => [provider('p', false)],
      })
    ).toThrow(/Open Media/)
  })
})
