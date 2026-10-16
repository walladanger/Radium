import { PlatformFeatures } from '@/lib/platform/const'
import { PlatformFeature } from '@/lib/platform/types'
import { getProviderTitle } from '@/lib/utils'
import {
  isLocalProvider,
  isLoopbackUrl,
  isSubscriptionProvider,
} from '@/utils/registerRemoteProvider'

// Which cloud providers the add-provider gallery offers, and in what order.
// Kept apart from AddCloudProviderDialog so that file exports only components.

/**
 * Providers that ship in the list but cannot be configured from a key alone.
 * Azure's `base_url` is the literal placeholder
 * `https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1` — every account has
 * its own resource host, so a key-only save produces a provider that looks
 * connected and fails on first request.
 */
const KEY_ONLY_UNSUPPORTED = new Set(['azure'])

/**
 * A provider you sign into rather than paste a key for — and only where that
 * sign-in can actually happen. The OAuth callback is served by the desktop
 * backend, so on web and mobile the card would offer a button that cannot work.
 */
export function isGallerySubscription(providerName: string): boolean {
  return (
    isSubscriptionProvider(providerName) &&
    PlatformFeatures[PlatformFeature.CHATGPT_SUBSCRIPTION]
  )
}

/**
 * Names `getProviderTitle` spells out too long for a one-line card.
 *
 * The subscription's full title is "ChatGPT subscription (Codex)", which the
 * half-width card truncates mid-word; the line underneath already says it is a
 * sign-in, so the card carries the brand alone.
 */
const GALLERY_LABELS: Record<string, string> = { chatgpt: 'ChatGPT (Codex)' }

export function galleryLabel(providerName: string): string {
  return GALLERY_LABELS[providerName] ?? getProviderTitle(providerName)
}

/**
 * Gallery order, most-wanted first — measured from `provider_key_configured`,
 * not from anybody's sense of which brand is the flagship.
 *
 * Keys configured to date: openrouter 72, gemini 54, huggingface 45, nvidia 37,
 * ollama 32, openai 30, groq 19, mistral 18, anthropic 17. Until now the
 * gallery rendered in registry order, which put the providers people actually
 * connect below the fold.
 *
 * Anything not listed keeps its registry position, after the ranked ones: a new
 * provider has no demand figure yet, and guessing one would be worse than
 * leaving it where the registry put it.
 */
const GALLERY_DEMAND_ORDER: readonly string[] = [
  'openrouter',
  'gemini',
  'huggingface',
  'nvidia',
  'ollama',
  'openai',
  'groq',
  'mistral',
  'anthropic',
]

const demandRank = (providerName: string): number => {
  const index = GALLERY_DEMAND_ORDER.indexOf(providerName)
  return index === -1 ? GALLERY_DEMAND_ORDER.length : index
}

/**
 * The cloud providers worth offering during onboarding: everything that talks
 * to somebody else's server and can be connected from this dialog.
 *
 * Sourced from the live provider list rather than the remote registry, because
 * `updateProvider` silently no-ops on a name that is not already in that list —
 * so offering a card the store has never heard of would save nothing, with no
 * error anywhere.
 *
 * Ordered by {@link GALLERY_DEMAND_ORDER}, with subscriptions lifted to the
 * front.
 */
export function selectCloudGalleryProviders(
  providers: ModelProvider[]
): ModelProvider[] {
  const offered = providers.filter(
    (p) =>
      !isLocalProvider(p.provider) &&
      // Catches `ollama` and any future LM-Studio-style entry without
      // hardcoding an id: a loopback base URL means the "cloud" is this machine.
      !isLoopbackUrl(p.base_url) &&
      !p.persist &&
      !KEY_ONLY_UNSUPPORTED.has(p.provider) &&
      // A subscription declares no `api-key` setting by design — its bearer
      // token lives in the Rust backend — so it has to qualify on its own.
      (isGallerySubscription(p.provider) ||
        p.settings?.some((s) => s.key === 'api-key'))
  )

  // Stable sort on the demand rank: providers sharing a rank (i.e. everything
  // unranked) keep the registry's relative order.
  const ranked = offered
    .map((provider, position) => ({ provider, position }))
    .sort(
      (a, b) =>
        demandRank(a.provider.provider) - demandRank(b.provider.provider) ||
        a.position - b.position
    )
    .map(({ provider }) => provider)

  // Subscriptions first. Signing in is the shortest way out of onboarding —
  // there is no dashboard to go and find a key on — yet `BASELINE_PROVIDERS` is
  // seeded after everything the registry carries, so the one provider that
  // needs nothing but a click would otherwise be the one to scroll for.
  const subscriptions = ranked.filter((p) => isSubscriptionProvider(p.provider))
  if (subscriptions.length === 0) return ranked
  return [
    ...subscriptions,
    ...ranked.filter((p) => !isSubscriptionProvider(p.provider)),
  ]
}
