/**
 * Generate an image or video from the chat composer.
 *
 * The Media page is for fine-tuning; chat is for asking. So this reuses what
 * the user last tuned for the task, swaps in the new prompt, runs the job
 * through the same job manager the Media page uses, and puts the result in the
 * same library - so a chat generation shows up under Media > Library and can be
 * saved, renamed and re-run like any other.
 */

import { ulid } from 'ulidx'

import {
  mediaJobManager,
  isTerminalMediaJobState,
  type MediaJobEntry,
  type MediaJobManager,
} from './jobManager'
import { materialize, type MaterializeDeps, type MediaAsset } from './assets'
import type {
  MediaCapabilities,
  MediaModelDescriptor,
  MediaProviderDescriptor,
  NormalizedMediaRequest,
} from './contract'
import type { MediaLastUsed } from '@/stores/media-last-used-store'

export type ChatMediaTaskId = 'text_to_image' | 'text_to_video'

export type ChatGenerationDeps = {
  manager: MediaJobManager
  providers: () => MediaProviderDescriptor[]
  capabilities: () => Record<string, MediaCapabilities>
  refresh: () => Promise<void>
  lastUsed: (task: string) => MediaLastUsed | undefined
  materializeDeps: MaterializeDeps
  addToLibrary: (assets: MediaAsset[]) => Promise<void>
  newId: () => string
  appVersion: string
}

export type ChatGenerationResult = {
  assets: MediaAsset[]
  request: NormalizedMediaRequest
  model_label: string
}

/** What a user sees when there is nothing to generate with. */
export class NoMediaModelError extends Error {
  constructor(task: string) {
    super(
      task === 'text_to_video'
        ? 'No video model is set up. Open Media, pick a video model and generate once.'
        : 'No image model is set up. Open Media, pick an image model and generate once.'
    )
    this.name = 'NoMediaModelError'
  }
}

function modelsFor(
  task: string,
  providers: MediaProviderDescriptor[],
  capabilities: Record<string, MediaCapabilities>
): MediaModelDescriptor[] {
  return providers
    .filter((provider) => provider.enabled)
    .flatMap((provider) => capabilities[provider.id]?.models ?? [])
    .filter((model) => model.tasks.includes(task))
}

function defaultsOf(model: MediaModelDescriptor, task: string) {
  const values: Record<string, unknown> = {}
  for (const spec of model.params?.[task] ?? []) {
    if (spec?.default !== undefined) values[spec.id] = spec.default
  }
  return values
}

/**
 * The model and parameters to use: the last used ones if that model is still
 * available, otherwise the first usable model with its own defaults.
 */
export function resolveChatRequest(
  task: string,
  prompt: string,
  deps: Pick<
    ChatGenerationDeps,
    'providers' | 'capabilities' | 'lastUsed' | 'newId'
  >
): { request: NormalizedMediaRequest; model: MediaModelDescriptor } {
  const candidates = modelsFor(task, deps.providers(), deps.capabilities())
  if (candidates.length === 0) throw new NoMediaModelError(task)

  const last = deps.lastUsed(task)
  const remembered = last
    ? candidates.find((model) => model.id === last.model_id)
    : undefined
  // Prefer something that can run now over something that needs downloading.
  const model =
    remembered ??
    candidates.find((entry) => entry.install?.installed !== false) ??
    candidates[0]!

  const params = remembered
    ? { ...defaultsOf(model, task), ...last?.params, prompt }
    : { ...defaultsOf(model, task), prompt }

  return {
    model,
    request: {
      client_job_id: deps.newId(),
      provider_id: model.provider_id,
      model_id: model.id,
      task,
      params,
      ...(remembered && last?.device ? { device: last.device } : {}),
    },
  }
}

/** Resolves when the job reaches a terminal state. */
function untilTerminal(
  manager: MediaJobManager,
  clientJobId: string,
  onUpdate?: (entry: MediaJobEntry) => void,
  signal?: AbortSignal
): Promise<MediaJobEntry> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const entry = manager.get(clientJobId)
      if (!entry) return
      onUpdate?.(entry)
      if (isTerminalMediaJobState(entry.state)) {
        unsubscribe()
        resolve(entry)
      }
    }
    const unsubscribe = manager.store.subscribe(check)
    signal?.addEventListener('abort', () => {
      unsubscribe()
      reject(new DOMException('Generation cancelled', 'AbortError'))
    })
    check()
  })
}

export async function generateMediaForChat(
  task: ChatMediaTaskId,
  prompt: string,
  deps: ChatGenerationDeps,
  options: { onUpdate?: (entry: MediaJobEntry) => void; signal?: AbortSignal } = {}
): Promise<ChatGenerationResult> {
  // Capabilities are not persisted; a fresh app start has none until asked.
  if (Object.keys(deps.capabilities()).length === 0) await deps.refresh()

  const { request, model } = resolveChatRequest(task, prompt, deps)
  await deps.manager.submit(request)
  const entry = await untilTerminal(
    deps.manager,
    request.client_job_id,
    options.onUpdate,
    options.signal
  )

  if (entry.state !== 'succeeded') {
    throw new Error(
      entry.error?.message ??
        (entry.state === 'cancelled'
          ? 'The generation was cancelled.'
          : 'The generation failed.')
    )
  }

  const assets = await materialize(
    entry,
    {
      request: entry.request,
      model_label: model.label,
      app_version: deps.appVersion,
    },
    deps.materializeDeps
  )
  if (assets.length === 0) throw new Error('The provider returned no output.')
  await deps.addToLibrary(assets)
  return { assets, request: entry.request, model_label: model.label }
}

/** The real dependencies. Built lazily so importing this stays side-effect free. */
export async function defaultChatGenerationDeps(): Promise<ChatGenerationDeps> {
  const [{ useMediaProviderStore }, { useMediaLastUsedStore }, library, hook] =
    await Promise.all([
      import('@/stores/media-provider-store'),
      import('@/stores/media-last-used-store'),
      import('@/stores/media-library-store'),
      import('@/hooks/useMediaJobAsset'),
    ])
  return {
    manager: mediaJobManager,
    providers: () => useMediaProviderStore.getState().providers,
    capabilities: () => useMediaProviderStore.getState().capabilities,
    refresh: () => useMediaProviderStore.getState().refresh(),
    lastUsed: (task) => useMediaLastUsedStore.getState().byTask[task],
    materializeDeps: hook.browserMaterializeDeps,
    addToLibrary: (assets) => library.useMediaLibraryStore.getState().add(assets),
    newId: () => ulid(),
    appVersion: VERSION,
  }
}
