import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { useWorkspacePanel } from '@/hooks/useWorkspacePanel'
import { useAtomicTasks } from '@/stores/atomic-tasks-store'
import { ProductionPanel } from './ProductionPanel'
import { AgentsPanel } from './AgentsPanel'

export function WorkspacePanel() {
  const { t } = useTranslation('workspace-panel')
  const { panel, close } = useWorkspacePanel()
  const { connection, connect, disconnect, error } = useAtomicTasks()
  const [address, setAddress] = useState('http://127.0.0.1:17432')
  const [token, setToken] = useState('')
  // A full page, not a side panel: it replaces the routed page while open so
  // only one page is ever on screen, and its body scrolls on its own.
  return <section id="workspace-panel" hidden={!panel} className={`${panel ? 'flex' : 'hidden'} h-full min-h-0 min-w-0 w-full flex-col bg-background`} aria-label={t(panel ?? 'production')}>
    <header className="flex items-center justify-between border-b px-4 py-3"><h2 className="font-semibold">{t(panel ?? 'production')}</h2><Button variant="ghost" size="icon" aria-label={t('close')} onClick={close}><X size={16} /></Button></header>
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-3 [overflow-wrap:anywhere]">
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
  </section>
}
