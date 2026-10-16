import type {
  CatalogModel,
  MMProjModel,
  ModelQuant,
} from '@/services/models/types'
import { DEFAULT_MODEL_QUANTIZATIONS } from '@/constants/models'
import { localStorageKey } from '@/constants/localStorage'
import { getPreferredMmprojModel } from '@/lib/models'
import { findPinnedQuant } from '@/lib/model-card'
import { judgeMemoryFit, type HardwareProfile } from '@/lib/hardware-tier'
import { pickSmallestRunnable } from '@/lib/scanned-model-import'
import { iconKeyLogoSrc, modelFamilyLogoSrc } from '@/lib/model-logo'

// Pure helpers for SetupScreen, kept out of the component file so it exports
// only components and React Fast Refresh keeps working.

//* Вариант загрузки: пин из манифеста, иначе приоритет квантов как в Hub.
//! Пин обязателен для LFM2.5-VL-450M (нужен Q8_0): репозиторий отдаёт и Q4_K_M,
//! который матчится DEFAULT_MODEL_QUANTIZATIONS — без пина скачается рабочий,
//! но не тот файл, и ошибка не всплывёт нигде.
export function pickPreferredVariant(
  model: CatalogModel,
  quantPin?: string
): ModelQuant | null {
  const pinned = findPinnedQuant(model.quants, quantPin)
  if (pinned) return pinned
  const preferred =
    model.quants?.find((m) =>
      DEFAULT_MODEL_QUANTIZATIONS.some((e) =>
        m.model_id.toLowerCase().includes(e)
      )
    ) ?? null
  return preferred ?? model.quants?.[0] ?? null
}

//* Проектор для vision-моделей: пин из манифеста, иначе обычный выбор.
//! getPreferredMmprojModel ищет буквальный id 'mmproj-f16'. У LiquidAI id —
//! 'mmproj-LFM2_5-VL-450m-F16', совпадения нет, и он падает на mmproj_models[0]
//! = BF16 (181 MB) вместо Q8_0 (98 MB).
export function pickMmprojModel(
  model: CatalogModel,
  quantPin?: string
): MMProjModel | undefined {
  return (
    findPinnedQuant(model.mmproj_models, quantPin) ??
    getPreferredMmprojModel(model)
  )
}

//* Размер найденной на диске модели (байты → "4.50 GB" / "850 MB")
export function formatDetectedSize(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`
}

//* Числовой размер в ГБ из строки каталога ("4.5 GB" / "850 MB") для аналитики.
export function sizeStringToGb(size?: string): number | undefined {
  if (!size) return undefined

  const match = size.trim().match(/^([\d.]+)\s*(MB|GB)$/i)
  if (!match) return undefined

  const value = Number(match[1])
  if (!Number.isFinite(value)) return undefined

  const gb = match[2].toUpperCase() === 'GB' ? value : value / 1024
  return Math.round(gb * 100) / 100
}

/**
 * Who a row is "from", for the purpose of not seating two of them together:
 * the brand mark the row wears (so `gemma`/`google` and `llama`/`meta`/`muse`
 * are one publisher each), else the repo owner. The repo owner alone would
 * not do — many picks are quantizer repacks (`unsloth/…`, `lmstudio-community/…`)
 * of other people's models.
 */
export function publisherKey(modelName: string, iconKey?: string): string {
  return (
    iconKeyLogoSrc(iconKey) ??
    modelFamilyLogoSrc(modelName) ??
    modelName.split('/')[0]?.toLowerCase() ??
    modelName.toLowerCase()
  )
}

/**
 * Reorders rows so no two neighbours share a publisher, and otherwise keeps
 * the order it was given: each slot takes the earliest remaining row whose
 * publisher differs from the previous slot's — starting from `previous`, the
 * publisher of whatever row sits above the list. When only one publisher is
 * left its rows follow each other, which is the best any order can do.
 * Deterministic on purpose: the list must not reshuffle between renders.
 */
export function interleaveByPublisher<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  previous?: string
): T[] {
  const remaining = [...rows]
  const out: T[] = []
  let last = previous
  while (remaining.length > 0) {
    const index = remaining.findIndex((row) => keyOf(row) !== last)
    const [next] = remaining.splice(index === -1 ? 0 : index, 1)
    out.push(next)
    last = keyOf(next)
  }
  return out
}

// Auto-start picks the smallest runnable candidate: it loads fastest, so the
// first launch feels instant. The rule is shared with the composer widget's
// "add a folder" route, so a folder added there starts the same model this
// screen would have.
export const pickAutoRunCandidate = pickSmallestRunnable

/// Whole-GB rendering of a MiB figure, for the "why this one" line. Rounded to
/// what the user would call their machine ("16 GB"), not to a decimal place
/// nobody reads off a spec sheet.
export function formatMemoryGb(mib?: number): string | null {
  if (!mib || mib <= 0) return null
  return `${Math.round(mib / 1024)} GB`
}

/**
 * The one line under the recommendation that says why it is this model.
 *
 * Returns the i18n key and its interpolation values rather than a string, so
 * the component stays a single `t()` call and the wording lives in the locale
 * files with the rest.
 *
 * The tiers deliberately say different things: a machine with no accelerator is
 * not memory-bound at all — it is bound by CPU throughput, and telling its owner
 * "fits your 64 GB" would explain the wrong constraint. Everything else is
 * judged by {@link judgeMemoryFit}, whose macOS ceiling is a hard one.
 */
export type RecommendationFitCopy = {
  key: string
  values: Record<string, string>
  /**
   * Name of the memory pool, as its own key so the caller resolves it before
   * interpolating. "16 GB" on a Mac and "16 GB" on a graphics card are not the
   * same 16 GB, and a line that omits which one reads as a claim about RAM.
   */
  poolKey?: string
}

export function describeRecommendationFit(args: {
  sizeLabel?: string | null
  sizeBytes?: number
  profile: HardwareProfile | null
}): RecommendationFitCopy | null {
  const { sizeLabel, sizeBytes, profile } = args
  if (!sizeLabel) return null
  const values: Record<string, string> = { size: sizeLabel }

  if (profile?.memoryKind === 'system') {
    return { key: 'setup:recommend.whyCpuOnly', values }
  }

  const budget = formatMemoryGb(profile?.budgetMib)
  const fit = judgeMemoryFit(sizeBytes, profile)
  if (!budget || !fit || !profile) {
    return { key: 'setup:recommend.whyUnknown', values }
  }

  const key = {
    comfortable: 'setup:recommend.whyComfortable',
    tight: 'setup:recommend.whyTight',
    spills: 'setup:recommend.whySpills',
    wont_load: 'setup:recommend.whyWontLoad',
  }[fit]
  return {
    key,
    values: { ...values, budget },
    poolKey: `setup:recommend.pool.${profile.memoryKind}`,
  }
}

export type OnboardingStep = 'backend' | 'model'

export function getInitialStep(): OnboardingStep {
  if (typeof window === 'undefined') return 'model'
  // Windows and Linux both install on a CPU build and both have a GPU build
  // to offer; the step used to be Windows-only, so a Linux host met its
  // Vulkan build only if the silent startup upgrade happened to fire.
  if (!IS_WINDOWS && !IS_LINUX) return 'model'
  // Already completed the dedicated step in a previous session.
  if (localStorage.getItem(localStorageKey.llamacppOnboardingDone)) {
    return 'model'
  }
  return 'backend'
}
