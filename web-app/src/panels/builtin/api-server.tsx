import { useAppState } from '@/hooks/useAppState'
import { useLocalApiServer } from '@/hooks/useLocalApiServer'
import { Chip } from '../Chip'
import { PanelBody, Readout, Section } from '../Readout'
import type { BuiltinPanel } from '../registry'

/**
 * Local API server status.
 *
 * Read-only on purpose: starting and stopping the server loads a model, picks
 * a provider and raises its own toasts (`useLocalApiServerControl`), and a
 * dashboard tile is the wrong place to do that by accident. This panel
 * answers "is it up, and what address do I point my tool at".
 *
 * The API key is reported as set or not set and never printed. A panel is a
 * thing people screen-share.
 */
function ApiServerPanel() {
  const serverStatus = useAppState((state) => state.serverStatus)
  const { serverHost, serverPort, apiPrefix, corsEnabled, trustedHosts, proxyTimeout, apiKey, enableOnStartup, lastServerModels } =
    useLocalApiServer()

  const running = serverStatus === 'running'
  const baseUrl = `http://${serverHost}:${serverPort}${apiPrefix}`

  return (
    <PanelBody>
      <Section title="Status">
        <div className="flex items-center gap-1.5">
          {running ? (
            <Chip>running</Chip>
          ) : serverStatus === 'pending' ? (
            <Chip tone="muted">starting…</Chip>
          ) : (
            <Chip tone="muted">stopped</Chip>
          )}
          <div className="flex-1" />
          {enableOnStartup && <Chip tone="muted">starts with app</Chip>}
        </div>
        {/* Only an address a caller can actually reach; a URL printed while
            the server is down is an invitation to debug the wrong thing. */}
        <Readout label="Base URL" value={running ? baseUrl : null} />
      </Section>

      <Section title="Configuration">
        <Readout label="Host" value={serverHost} />
        <Readout label="Port" value={serverPort} />
        <Readout label="Prefix" value={apiPrefix} />
        <Readout label="CORS" value={corsEnabled ? 'enabled' : 'disabled'} />
        <Readout label="API key" value={apiKey ? 'set' : 'not set'} />
        <Readout label="Timeout" value={`${proxyTimeout}s`} />
        <Readout label="Trusted hosts" value={trustedHosts.length} />
      </Section>

      <Section title="Served models">
        {lastServerModels.length === 0 ? (
          <div className="text-muted-foreground">
            {running ? 'No model served yet.' : 'Nothing served since the last start.'}
          </div>
        ) : (
          lastServerModels.map((entry) => (
            <div key={`${entry.provider}/${entry.model}`} className="flex items-center gap-1.5">
              <span className="truncate font-mono" title={entry.model}>
                {entry.model}
              </span>
              <div className="flex-1" />
              <Chip tone="muted">{entry.provider}</Chip>
            </div>
          ))
        )}
      </Section>
    </PanelBody>
  )
}

export const panel: BuiltinPanel = {
  id: 'api-server',
  name: 'Local API server',
  component: ApiServerPanel,
  defaultSize: { w: 4, h: 8 },
}
