import { useMemo } from 'react'
import { useAppState } from '@/hooks/useAppState'
import { useMCPServers } from '@/hooks/useMCPServers'
import { useMCPServerStatuses } from '@/hooks/useMCPServerStatuses'
import { Chip } from '../Chip'
import { PanelBody, Readout, Section } from '../Readout'
import type { BuiltinPanel } from '../registry'

/**
 * MCP servers and the tools they expose.
 *
 * Three sources, deliberately kept apart: the *configured* servers (what the
 * user wrote down), their *live* status (what the backend managed to connect
 * to), and the *tool* snapshot (what those connections actually offer). A
 * server can be configured and not running, running and offering nothing, or
 * erroring with a reason — and the panel says which, rather than collapsing
 * all three into a count.
 *
 * The tool count is the subtle one. The snapshot is fetched elsewhere (the
 * chat path owns `useTools`), so this panel may open before it exists. An
 * empty snapshot would make every connected server read "0 tools", which is a
 * different claim from "we have not asked yet" — so until any tool is known,
 * the count is a dash.
 */
function MCPPanel() {
  const configured = useMCPServers((state) => state.mcpServers)
  const loading = useMCPServers((state) => state.loading)
  const { statusByName } = useMCPServerStatuses()
  const tools = useAppState((state) => state.tools)

  const toolsByServer = useMemo(() => {
    const grouped = new Map<string, string[]>()
    for (const tool of tools) {
      const names = grouped.get(tool.server) ?? []
      names.push(tool.name)
      grouped.set(tool.server, names)
    }
    return grouped
  }, [tools])

  const toolsKnown = tools.length > 0
  const names = Object.keys(configured).sort((left, right) => left.localeCompare(right))

  return (
    <PanelBody
      loading={loading && names.length === 0}
      empty={
        names.length === 0
          ? 'No MCP servers configured. Add one in Settings → MCP Servers.'
          : null
      }
    >
      {names.map((name) => {
        const config = configured[name]
        const status = statusByName.get(name)
        const connected = status?.status === 'connected'
        const serverTools = toolsByServer.get(name) ?? []
        return (
          <div key={name} className="space-y-1 rounded-md border border-border p-2">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-semibold" title={name}>
                {name}
              </span>
              <div className="flex-1" />
              {status?.status === 'error' ? (
                <Chip tone="bad">error</Chip>
              ) : connected ? (
                <Chip>connected</Chip>
              ) : config.active === false ? (
                <Chip tone="muted">off</Chip>
              ) : (
                <Chip tone="muted">not connected</Chip>
              )}
            </div>
            <Readout label="Transport" value={config.type ?? 'stdio'} />
            <Readout
              label={config.url ? 'URL' : 'Command'}
              value={config.url ?? config.command}
            />
            <Readout
              label="Tools"
              value={connected && toolsKnown ? serverTools.length : null}
            />
            {status?.error && <div className="text-destructive">{status.error}</div>}
            {connected && serverTools.length > 0 && (
              <Section title="Exposes">
                <div className="flex flex-wrap gap-1">
                  {serverTools.sort().map((tool) => (
                    <Chip key={tool} tone="muted">
                      {tool}
                    </Chip>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )
      })}
    </PanelBody>
  )
}

export const panel: BuiltinPanel = {
  id: 'mcp',
  name: 'MCP servers',
  component: MCPPanel,
  defaultSize: { w: 5, h: 10 },
}
