import { useMemo } from 'react'
import { useAppState } from '@/hooks/useAppState'
import { useModelProvider } from '@/hooks/useModelProvider'
import { shortModelName } from '@/lib/downloadFormat'
import { Chip } from '../Chip'
import { PanelBody, Readout, Section } from '../Readout'
import type { BuiltinPanel } from '../registry'

/**
 * Model and engine status: what is loaded right now, how fast the last turn
 * ran, and which providers are configured behind it.
 *
 * `tokenSpeed` is the reason this panel needs the dash discipline. It is
 * `undefined` until a generation has actually measured one, and is cleared
 * between turns — printing `0 tok/s` for "we have not measured" would read as
 * a stalled model.
 */
function ModelsPanel() {
  const activeModels = useAppState((state) => state.activeModels)
  const loadingModel = useAppState((state) => state.loadingModel)
  const tokenSpeed = useAppState((state) => state.tokenSpeed)
  const providers = useModelProvider((state) => state.providers)

  const providerByModel = useMemo(() => {
    const owner = new Map<string, string>()
    for (const provider of providers) {
      for (const model of provider.models ?? []) {
        // First provider wins: the same model id can appear under several, and
        // guessing differently per render would make the panel flicker.
        if (!owner.has(model.id)) owner.set(model.id, provider.provider)
      }
    }
    return owner
  }, [providers])

  const activeProviders = providers.filter((provider) => provider.active)

  /**
   * The local inference engine, as the provider records it: `version_backend`
   * holds `"<version>/<build>"` (e.g. `b4567/linux-avx2-cuda-cu12.0`). Read
   * rather than probed — the backend already keeps this on the provider, and
   * a panel has no business launching its own version check.
   */
  const engine = useMemo(() => {
    for (const provider of providers) {
      const value = provider.settings?.find(
        (setting) => setting.key === 'version_backend'
      )?.controller_props?.value
      if (typeof value !== 'string' || !value.includes('/')) continue
      const [version, build] = value.split('/').map((part) => part.trim())
      if (version && build) return { provider: provider.provider, version, build }
    }
    return null
  }, [providers])

  return (
    <PanelBody>
      <Section title="Loaded">
        {activeModels.length === 0 ? (
          <div className="text-muted-foreground">
            {loadingModel ? 'Loading a model…' : 'No model loaded.'}
          </div>
        ) : (
          activeModels.map((model) => (
            <div key={model} className="flex items-center gap-1.5">
              <span className="truncate font-mono" title={model}>
                {shortModelName(model)}
              </span>
              <div className="flex-1" />
              <Chip tone="muted">{providerByModel.get(model) ?? 'unknown provider'}</Chip>
            </div>
          ))
        )}
        {loadingModel && activeModels.length > 0 && (
          <div className="text-muted-foreground">Loading another model…</div>
        )}
      </Section>

      <Section title="Last turn">
        <Readout
          label="Speed"
          value={tokenSpeed ? `${tokenSpeed.tokenSpeed.toFixed(1)} tok/s` : null}
        />
        <Readout label="Tokens" value={tokenSpeed ? tokenSpeed.tokenCount : null} />
      </Section>

      <Section title="Engine">
        <Readout label="Backend" value={engine?.provider} />
        <Readout label="Version" value={engine?.version} />
        <Readout label="Build" value={engine?.build} />
      </Section>

      <Section title="Providers">
        <Readout label="Configured" value={providers.length || null} />
        <Readout label="Enabled" value={providers.length ? activeProviders.length : null} />
        {activeProviders.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {activeProviders.map((provider) => (
              <Chip key={provider.provider} tone="muted">
                {provider.provider} · {provider.models?.length ?? 0}
              </Chip>
            ))}
          </div>
        )}
      </Section>
    </PanelBody>
  )
}

export const panel: BuiltinPanel = {
  id: 'models',
  name: 'Models',
  component: ModelsPanel,
  defaultSize: { w: 4, h: 8 },
}
