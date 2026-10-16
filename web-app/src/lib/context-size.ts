import {
  computeNextCtxLen,
  DEFAULT_CTX_LEN,
  EngineManager,
  type AIEngine,
} from '@janhq/core'
import { useModelProvider } from '@/hooks/useModelProvider'
import { readProviderFit } from '@/lib/provider-fit'
import type { ServiceHub } from '@/services'

/** Re-exported so web-app callers have one import for the one default. */
export { DEFAULT_CTX_LEN }

export type GrowContextResult =
  | { ok: true; from: number; to: number }
  | {
      ok: false
      /**
       * `fit` — the engine sizes the context itself (`--fit`); there is no
       * knob to turn, and a reload with a bigger `ctx_size` would be sized
       * straight back down.
       */
      reason: 'at_max' | 'no_model' | 'no_provider' | 'fit'
      from: number
      max?: number
    }

type ModelLike = {
  id: string
  settings?: {
    ctx_len?: { controller_props?: { value?: unknown } }
    auto_increase_ctx_len?: { controller_props?: { value?: unknown } }
  }
}

/**
 * Read a positive finite context size from the model's settings.
 * Strings use parseInt with radix 10, so a leading integer is accepted.
 *
 * @param model Model record; absent or unparseable settings return undefined.
 * @returns The stored number or parsed integer; numeric values are not rounded.
 */
export function readModelCtxLen(model: ModelLike | null | undefined): number | undefined {
  const raw = model?.settings?.ctx_len?.controller_props?.value
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw
  if (typeof raw === 'string') {
    const parsed = parseInt(raw, 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return undefined
}

/**
 * Read the model's automatic context-growth preference.
 *
 * @param model Model record with an optional auto_increase_ctx_len setting.
 * @returns The stored boolean, or true for absent and non-boolean values.
 */
export function readAutoIncreaseCtx(model: ModelLike | null | undefined): boolean {
  const raw = model?.settings?.auto_increase_ctx_len?.controller_props?.value
  return typeof raw === 'boolean' ? raw : true
}

/**
 * Training-max context of a local model, asked from its engine. Duck-typed:
 * cloud providers and extensions without `getMaxCtxTrain` yield `undefined`,
 * which leaves the ladder open-ended (as before).
 *
 * @param providerId Engine registry id, not a display name.
 * @param modelId Model id understood by that engine.
 * @returns The engine's reported limit, or undefined if unsupported or lookup
 * fails. Failures are logged rather than propagated.
 */
export async function getModelMaxCtxTrain(
  providerId: string,
  modelId: string
): Promise<number | undefined> {
  try {
    const engine = EngineManager.instance().get(providerId) as
      | (AIEngine & {
          getMaxCtxTrain?: (id: string) => Promise<number | undefined>
        })
      | undefined
    if (engine && typeof engine.getMaxCtxTrain === 'function') {
      return await engine.getMaxCtxTrain(modelId)
    }
  } catch (e) {
    console.warn(
      `[auto-expand-ctx] getMaxCtxTrain failed for ${providerId}/${modelId}:`,
      e
    )
  }
  return undefined
}

/**
 * Grow a local model's context window along the shared ladder
 * (`computeNextCtxLen`: `<8192 → 8192 → 32768 → ×1.5`, capped at the
 * training max) and unload the model so the next request reloads it at the
 * new size.
 *
 * With `minCtxLen` the ladder is stepped until the window is at least that
 * large (or the cap is hit), so a pre-flight that already knows the prompt
 * size pays for a single reload instead of one per step.
 *
 * Only the provider store and the engine session are touched; regenerating
 * or re-sending is the caller's business.
 *
 * @param args Provider/model ids, services, and optional desired minimum size.
 * @returns A growth result or a reason no growth was performed. A successful
 * result can still be below minCtxLen when the training maximum caps growth.
 * @throws If stopping the model fails. The provider setting is already updated
 * at that point and is not rolled back.
 */
export async function growModelContext(args: {
  providerId: string
  modelId: string
  serviceHub: ServiceHub
  minCtxLen?: number
}): Promise<GrowContextResult> {
  const { providerId, modelId, serviceHub, minCtxLen } = args
  const { getProviderByName, updateProvider } = useModelProvider.getState()
  const provider = getProviderByName(providerId)
  if (!provider) return { ok: false, reason: 'no_provider', from: 0 }

  const modelIndex = provider.models.findIndex((m) => m.id === modelId)
  if (modelIndex === -1) return { ok: false, reason: 'no_model', from: 0 }
  const model = provider.models[modelIndex]

  const from = readModelCtxLen(model as ModelLike) ?? DEFAULT_CTX_LEN
  if (readProviderFit(provider) === true) {
    return { ok: false, reason: 'fit', from }
  }
  const maxCtxLen = await getModelMaxCtxTrain(providerId, modelId)

  let to = from
  for (;;) {
    const next = computeNextCtxLen(to, maxCtxLen)
    if (next <= to) break
    to = next
    if (minCtxLen === undefined || to >= minCtxLen) break
  }
  if (to <= from) {
    return { ok: false, reason: 'at_max', from, max: maxCtxLen }
  }

  const updatedModel = {
    ...model,
    settings: {
      ...model.settings,
      ctx_len: {
        ...(model.settings?.ctx_len ?? {}),
        controller_props: {
          ...(model.settings?.ctx_len?.controller_props ?? {}),
          value: to,
        },
      },
    },
  }
  const updatedModels = [...provider.models]
  updatedModels[modelIndex] = updatedModel as typeof model
  updateProvider(provider.provider, { models: updatedModels })

  // Scoped to this provider: an unscoped `stopModel` would also unload a
  // copy of the model another engine may be serving.
  await serviceHub.models().stopModel(modelId, providerId)

  return { ok: true, from, to }
}
