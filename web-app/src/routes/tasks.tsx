import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { route } from '@/constants/routes'
import HeaderPage from '@/containers/HeaderPage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { taskColumns } from '@/lib/atomic-control'
import { useAtomicTasks } from '@/stores/atomic-tasks-store'

// Generated route typing is refreshed by the existing Vite router plugin.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = createFileRoute(route.tasks as any)({ component: TasksPage })

type DraftTask = { id: string; title: string; description: string; role: string; dependencies: string[]; scope: string }
const newTask = (): DraftTask => ({ id: crypto.randomUUID(), title: '', description: '', role: 'edit', dependencies: [], scope: '' })

export function TasksPage() {
  const { t } = useTranslation('atomic-tasks')
  const state = useAtomicTasks()
  const [base, setBase] = useState('http://127.0.0.1:17432')
  const [token, setToken] = useState('')
  const [planId, setPlanId] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [title, setTitle] = useState('')
  const [project, setProject] = useState('')
  const [draft, setDraft] = useState<DraftTask[]>(() => [newTask()])
  const [draftError, setDraftError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const snapshot = state.snapshot
  const plan = snapshot?.plans.find(item => item.id === planId) ?? snapshot?.plans[0]
  const tasks = useMemo(() => snapshot?.tasks.filter(task => task.plan_id === plan?.id) ?? [], [snapshot, plan?.id])
  const columns = useMemo(() => taskColumns(tasks), [tasks])
  const dependencyNames = (dependencies: string[]) => dependencies.map(id => tasks.find(task => task.id === id)?.title ?? id).join(', ')
  const selected = tasks.find(task => task.id === selectedId)
  const attempts = snapshot?.attempts.filter(attempt => attempt.task_id === selected?.id) ?? []
  const approvals = snapshot?.approvals.filter(approval => approval.status === 'pending') ?? []
  const disabled = state.connection !== 'connected' || state.busy
  const act = (type: string, id: string, revision: number, kind: 'plan_id' | 'task_id' | 'approval_id', extra = {}) => void state.command({ type, [kind]: id, ...extra }, revision)

  const createPlan = async () => {
    try {
      if (!title.trim() || !project.trim() || !draft.length || draft.some(task => !task.title.trim())) throw new Error(t('required'))
      const parsed = draft.map(task => ({ id: task.id, title: task.title.trim(), description: task.description, role: task.role, dependencies: task.dependencies, write_scopes: task.scope.split('\n').map(path => path.trim()).filter(Boolean) }))
      setDraftError(null)
      const previous = new Set(snapshot?.plans.map(plan => plan.id))
      if (await state.command({ type: 'create_plan', project_id: project.trim(), title: title.trim(), tasks: parsed })) {
        const created = useAtomicTasks.getState().snapshot?.plans.find(plan => !previous.has(plan.id) && plan.project_id === project.trim() && plan.title === title.trim())
        if (created) setPlanId(created.id)
        setSelectedId('')
        setShowCreate(false)
        setTitle('')
        setDraft([newTask()])
      }
    } catch (error) { setDraftError(String(error)) }
  }

  return <div className="flex h-full flex-col bg-background">
    <HeaderPage><h1 className="font-semibold">{t('title')}</h1></HeaderPage>
    <div className="flex-1 overflow-auto p-4 space-y-4">
      <p className="text-sm text-muted-foreground">{t('intro')}</p>
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void state.connect(base, token); setToken('') }}>
        <label className="flex-1 min-w-52 text-sm">{t('address')}<Input value={base} onChange={event => setBase(event.target.value)} disabled={state.connection !== 'disconnected'} /></label>
        {state.connection === 'disconnected' ? <><label className="flex-1 min-w-40 text-sm">{t('token')}<Input type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} /></label><Button type="submit" disabled={!token.trim()}>{t('connect')}</Button></> : <Button type="button" variant="outline" onClick={state.disconnect}>{t('disconnect')}</Button>}
      </form>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={state.agUiEnabled ?? false} onChange={event => state.setAgUiEnabled(event.target.checked)} />{t('agUi')}</label>
      <p className="text-xs text-muted-foreground">{t('agUiHelp')}</p>
      <p role="status" className="text-sm">{t(`connection.${state.connection}`)}{snapshot ? ` · ${t('sequence')} ${snapshot.sequence}` : ''}</p>
      {state.error && <p role="alert" className="text-sm text-destructive break-words">{state.error}</p>}
      {snapshot && <>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm">{t('plan')} <select className="border rounded p-2 bg-background" value={plan?.id ?? ''} onChange={event => { setPlanId(event.target.value); setSelectedId('') }} aria-label={t('plan')}>{snapshot.plans.map(item => <option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}</select></label>
          <Button variant="outline" disabled={disabled} onClick={() => setShowCreate(!showCreate)}>{t('create')}</Button>
          {plan && <>{['start', 'pause', 'cancel'].map(action => <Button key={action} variant="outline" disabled={disabled || plan.status === 'completed' || plan.status === 'cancelled' || (action === 'start' && plan.status === 'active') || (action === 'pause' && plan.status !== 'active')} onClick={() => act(`${action}_plan`, plan.id, plan.revision, 'plan_id')}>{t(action)}</Button>)}</>}
        </div>
        {showCreate && <section className="border rounded p-3 space-y-2">
          <h2 className="font-medium">{t('create')}</h2>
          <label className="block text-sm">{t('project')}<Input value={project} onChange={event => setProject(event.target.value)} /></label>
          <label className="block text-sm">{t('planTitle')}<Input value={title} onChange={event => setTitle(event.target.value)} /></label>
          {draft.map((task, index) => <fieldset key={task.id} className="border rounded p-3 space-y-2">
            <legend className="text-sm">{t('task')} {index + 1}</legend>
            <label className="block text-sm">{t('taskTitle')}<Input value={task.title} onChange={event => setDraft(items => items.map(item => item.id === task.id ? { ...item, title: event.target.value } : item))} /></label>
            <label className="block text-sm">{t('description')}<textarea className="w-full border rounded bg-background p-2" value={task.description} onChange={event => setDraft(items => items.map(item => item.id === task.id ? { ...item, description: event.target.value } : item))} /></label>
            <label className="block text-sm">{t('role')} <select className="border rounded bg-background p-2" value={task.role} onChange={event => setDraft(items => items.map(item => item.id === task.id ? { ...item, role: event.target.value } : item))}>{['plan', 'edit', 'test', 'review', 'documentation'].map(role => <option key={role} value={role}>{t(`roleNames.${role}`)}</option>)}</select></label>
            <label className="block text-sm">{t('scope')}<textarea className="w-full border rounded bg-background p-2" value={task.scope} onChange={event => setDraft(items => items.map(item => item.id === task.id ? { ...item, scope: event.target.value } : item))} /></label>
            <p className="text-xs text-muted-foreground">{t('scopeHelp')}</p>
            <p className="text-sm">{t('depends')}</p>{draft.slice(0, index).map(prerequisite => <label key={prerequisite.id} className="block text-sm"><input type="checkbox" checked={task.dependencies.includes(prerequisite.id)} onChange={event => setDraft(items => items.map(item => item.id === task.id ? { ...item, dependencies: event.target.checked ? [...item.dependencies, prerequisite.id] : item.dependencies.filter(id => id !== prerequisite.id) } : item))} /> {prerequisite.title || `${t('task')} ${draft.indexOf(prerequisite) + 1}`}</label>)}
            <Button variant="outline" onClick={() => setDraft(items => items.filter(item => item.id !== task.id).map(item => ({ ...item, dependencies: item.dependencies.filter(id => id !== task.id) })))} disabled={draft.length === 1}>{t('remove')}</Button>
          </fieldset>)}
          <Button variant="outline" onClick={() => setDraft(items => [...items, newTask()])}>{t('addTask')}</Button>
          {draftError && <p role="alert" className="text-destructive text-sm">{draftError}</p>}
          <Button disabled={disabled} onClick={() => void createPlan()}>{t('save')}</Button>
        </section>}
        <p className="text-sm">{tasks.filter(task => task.status === 'completed').length} / {tasks.length} {t('validated')} · {tasks.filter(task => task.status === 'running').length} {t('running')} · {tasks.filter(task => task.status === 'ready').length} {t('queued')}</p>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <section className="border rounded overflow-auto p-3" aria-label={t('graph')}>
            {!tasks.length ? <p className="text-muted-foreground">{t('empty')}</p> : <div className="relative" style={{ width: Math.max(320, columns.length * 250), height: Math.max(150, ...columns.map(column => column.length * 110)) }}>
              <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%" aria-hidden="true">
                {columns.flatMap((column, x) => column.flatMap((task, y) => task.dependencies.map(dep => {
                  const dx = columns.findIndex(items => items.some(item => item.id === dep))
                  const dy = columns[dx]?.findIndex(item => item.id === dep) ?? -1
                  return dx < 0 ? null : <path key={`${dep}-${task.id}`} d={`M ${dx * 250 + 230} ${dy * 110 + 45} C ${dx * 250 + 245} ${dy * 110 + 45}, ${x * 250 - 15} ${y * 110 + 45}, ${x * 250} ${y * 110 + 45}`} fill="none" stroke="currentColor" className="text-muted-foreground" strokeWidth="2" />
                })))}
              </svg>
              {columns.flatMap((column, x) => column.map((task, y) => <button key={task.id} className={`absolute text-left border rounded-lg bg-card p-3 h-24 w-[230px] focus-visible:ring-2 ${selected?.id === task.id ? 'border-primary' : ''}`} style={{ left: x * 250, top: y * 110 }} onClick={() => setSelectedId(task.id)} aria-pressed={selected?.id === task.id}>
                <span className="block truncate font-medium">{task.title}</span><span className="block text-xs text-muted-foreground">{task.role} · {t(`status.${task.status}`)}</span><span className="block text-xs truncate">{task.dependencies.length ? `${t('depends')} ${dependencyNames(task.dependencies)}` : t('independent')}</span>
              </button>))}
            </div>}
          </section>
          <section className="border rounded p-3 space-y-3" aria-label={t('details')}>
            {selected ? <><h2 className="font-semibold">{selected.title}</h2><p className="text-sm whitespace-pre-wrap">{selected.description}</p><p className="text-sm">{t('scope')}: {selected.write_scopes.join(', ') || t('readOnly')}</p><p className="text-sm">{t('depends')}: {dependencyNames(selected.dependencies) || t('independent')}</p>
              <div className="flex gap-2"><Button variant="outline" disabled={disabled || selected.status !== 'failed' || attempts.length >= 2} onClick={() => act('retry_task', selected.id, selected.revision, 'task_id')}>{t('retry')}</Button><Button variant="outline" disabled={disabled || ['completed', 'cancelled'].includes(selected.status)} onClick={() => act('cancel_task', selected.id, selected.revision, 'task_id')}>{t('cancel')}</Button></div>
              <h3 className="font-medium">{t('attempts')}</h3>{attempts.map(attempt => <div key={attempt.id} className="text-sm border-b pb-2"><p>{attempt.model} · {attempt.status}</p><p className="text-muted-foreground">{attempt.worker_id} · {new Date(attempt.created_at).toLocaleString()}</p></div>)}
              <h3 className="font-medium">{t('artifacts')}</h3>{snapshot.artifacts.filter(artifact => artifact.task_id === selected.id).map(artifact => <p key={artifact.id} className="text-sm break-all">{artifact.kind} · {artifact.path} · {artifact.validated ? t('verified') : t('unverified')}</p>)}
              <p className="text-xs text-muted-foreground">{t('integrationNotice')}</p>
            </> : <p className="text-muted-foreground">{t('select')}</p>}
          </section>
        </div>
        <section className="border rounded p-3 space-y-2"><h2 className="font-semibold">{t('approvals')}</h2>{!approvals.length && <p className="text-sm text-muted-foreground">{t('noApprovals')}</p>}{approvals.map(approval => <div key={approval.id} className="flex flex-wrap items-center gap-2 border-t pt-2"><p className="flex-1 text-sm">{approval.kind}: {approval.description} · {approval.task_id}</p>{['allow', 'deny'].map(decision => <Button key={decision} variant="outline" disabled={disabled || approval.expires_at <= Date.now()} onClick={() => act('resolve_approval', approval.id, approval.revision, 'approval_id', { decision })}>{t(decision)}</Button>)}</div>)}</section>
      </>}
    </div>
  </div>
}
