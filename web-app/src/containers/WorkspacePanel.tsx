import { useState } from 'react'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { useWorkspacePanel } from '@/hooks/useWorkspacePanel'
import { useWorkspacePanelSize } from '@/hooks/useWorkspacePanelSize'
import { useAtomicTasks } from '@/stores/atomic-tasks-store'
import { ProductionPanel } from './ProductionPanel'
import { AgentsPanel } from './AgentsPanel'

export function WorkspacePanel() {
  const { t } = useTranslation('workspace-panel')
  const { panel, close } = useWorkspacePanel()
  const { connection, connect, disconnect, error } = useAtomicTasks()
  const [address, setAddress] = useState('http://127.0.0.1:17432')
  const [token, setToken] = useState('')
  const size = useWorkspacePanelSize(!!panel)
  return <aside ref={size.panelRef} id="workspace-panel" hidden={!panel} style={size.desktop ? { width: size.width } : undefined} className={`relative ${panel ? 'flex' : 'hidden'} min-h-0 min-w-0 w-full flex-col border-b bg-background md:shrink-0 md:border-b-0 md:border-r max-md:shrink-0 ${size.expanded ? 'max-md:h-[70dvh]' : 'max-md:max-h-[55dvh]'}`} aria-label={t(panel ?? 'production')}>
    <header className="flex items-center justify-between border-b px-4 py-3"><h2 className="font-semibold">{t(panel ?? 'production')}</h2><div className="flex items-center gap-1"><Button variant="ghost" size="icon" aria-label={t(size.expanded ? 'restore' : 'expand')} aria-expanded={size.expanded} onClick={size.toggleExpanded}>{size.expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</Button><Button variant="ghost" size="icon" aria-label={t('close')} onClick={close}><X size={16} /></Button></div></header>
    <div className="min-h-0 min-w-0 flex-1 overflow-auto p-3 space-y-3 [overflow-wrap:anywhere]">
      <p role="status" className="text-xs text-muted-foreground">{t(`connection.${connection}`)}</p>
      {connection === 'disconnected' ? <form className="space-y-2" onSubmit={event => { event.preventDefault(); void connect(address, token); setToken('') }}>
        <label className="block text-xs">{t('address')}<Input value={address} onChange={event => setAddress(event.target.value)} /></label>
        <label className="block text-xs">{t('token')}<Input type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} /></label>
        <Button type="submit" disabled={!token.trim()}>{t('connect')}</Button>
      </form> : <Button variant="outline" size="sm" onClick={disconnect}>{t('disconnect')}</Button>}
      {error && <p role="alert" className="text-xs text-destructive break-words">{error}</p>}
      <div hidden={panel !== 'production'}><ProductionPanel /></div>
      <div hidden={panel !== 'agents'}><AgentsPanel active={panel === 'agents'} /></div>
    </div>
    {size.desktop && <div role="separator" tabIndex={0} aria-label={t('resize')} aria-controls="workspace-panel" aria-orientation="vertical" aria-valuemin={Math.round(size.minWidth)} aria-valuemax={Math.round(size.maxWidth)} aria-valuenow={size.width} className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none select-none hover:bg-primary/20 focus-visible:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...size.separatorProps} />}
  </aside>
}
