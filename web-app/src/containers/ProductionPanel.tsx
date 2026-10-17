import { useEffect, useMemo, useState } from 'react'
import { useWorkspacePanel } from '@/hooks/useWorkspacePanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { taskColumns, type ControlTask } from '@/lib/atomic-control'
import { useAtomicTasks } from '@/stores/atomic-tasks-store'
import { productionTopology } from '@/lib/production-topology'
import { RenderMarkdown } from './RenderMarkdown'
import { ProductionBranchMap } from './ProductionBranchMap'
import { ProductionLog } from './ProductionLog'

const lines = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string') : []

function StepEditor({ task, editable }: { task: ControlTask; editable: boolean }) {
  const { t } = useTranslation('atomic-tasks')
  const command = useAtomicTasks(state => state.command)
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [instructions, setInstructions] = useState(lines(task.instructions).join('\n'))
  const [criteria, setCriteria] = useState(lines(task.acceptance_criteria).join('\n'))
  const [saved, setSaved] = useState(false)
  const [revision, setRevision] = useState(task.revision)
  const stale = revision !== task.revision
  const save = async () => {
    setSaved(false)
    const ok = await command({ type: 'update_task', task_id: task.id, title,
      description, instructions: instructions.split('\n').map(item => item.trim()).filter(Boolean),
      acceptance_criteria: criteria.split('\n').map(item => item.trim()).filter(Boolean) }, revision)
    if (ok) { setRevision(revision + 1); setSaved(true) }
  }
  return <form className="space-y-3 rounded-lg border p-3" onSubmit={event => { event.preventDefault(); void save() }}>
    <label className="block text-sm">{t('taskTitle')}<Input value={title} disabled={!editable} onChange={event => { setTitle(event.target.value); setSaved(false) }} /></label>
    <label className="block text-sm">{t('description')}<textarea className="mt-1 min-h-24 w-full rounded border bg-background p-2" value={description} disabled={!editable} onChange={event => { setDescription(event.target.value); setSaved(false) }} /></label>
    <label className="block text-sm">{t('productionInstructions', { defaultValue: 'Exact instructions — one action per line' })}<textarea className="mt-1 min-h-32 w-full rounded border bg-background p-2" value={instructions} disabled={!editable} onChange={event => { setInstructions(event.target.value); setSaved(false) }} /></label>
    <label className="block text-sm">{t('productionCriteria', { defaultValue: 'Acceptance criteria — what must be demonstrated' })}<textarea className="mt-1 min-h-24 w-full rounded border bg-background p-2" value={criteria} disabled={!editable} onChange={event => { setCriteria(event.target.value); setSaved(false) }} /></label>
    <p className="text-xs text-muted-foreground">{t('productionEditPolicy', { defaultValue: 'Pause the plan before editing. Saved revisions become the instructions for the next attempt; they do not change an attempt already in progress.' })}</p>
    {stale && <p role="alert">{t('productionConflict', { defaultValue: 'This step changed elsewhere. Your draft is preserved. Reload the saved version before editing again.' })}</p>}
    {stale && <Button type="button" variant="outline" onClick={() => { setTitle(task.title); setDescription(task.description); setInstructions(lines(task.instructions).join('\n')); setCriteria(lines(task.acceptance_criteria).join('\n')); setRevision(task.revision); setSaved(false) }}>{t('productionReload', { defaultValue: 'Reload saved step' })}</Button>}
    <Button type="submit" disabled={!editable || stale || !title.trim()}>{t('save')}</Button>
    {saved && <p role="status">{t('productionSaved', { defaultValue: 'Plan step saved.' })}</p>}
  </form>
}

/** A projection/editor of the canonical plan, never a second checklist journal. */
export function ProductionPanel() {
  const { t } = useTranslation('atomic-tasks')
  const state = useAtomicTasks()
  const [planId, setPlanId] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const view = useWorkspacePanel(state => state.productionView)
  const setView = useWorkspacePanel(state => state.setProductionView)
  const [logOpened, setLogOpened] = useState(view === 'annotations')
  useEffect(() => { if (view === 'annotations') setLogOpened(true) }, [view])
  const plan = state.snapshot?.plans.find(item => item.id === planId) ?? state.snapshot?.plans[0]
  const tasks = useMemo(() => state.snapshot?.tasks.filter(item => item.plan_id === plan?.id) ?? [], [state.snapshot, plan?.id])
  const columns = useMemo(() => taskColumns(tasks), [tasks])
  const ordered = columns.flat()
  const selected = tasks.find(item => item.id === selectedId)
  const attempts = state.snapshot?.attempts.filter(attempt => attempt.task_id === selected?.id) ?? []
  const activeAttempt = attempts.some(attempt => ['running', 'waiting_approval', 'verifying', 'outcome_unknown'].includes(attempt.status))
  const names = new Map(tasks.map(item => [item.id, item.title]))
  const connected = state.connection === 'connected'
  const editable = connected && !state.busy && !!plan && ['draft', 'paused'].includes(plan.status)
  return <section aria-label={t('productionTitle', { defaultValue: 'Production' })} className="flex h-full min-w-0 flex-col">
    <header className="space-y-3 border-b p-4">
      {view !== 'annotations' && <>
        <p className="text-sm text-muted-foreground">{t('productionIntro', { defaultValue: 'Discuss the plan in chat. Keep the agreed steps, instructions, and evidence here for both humans and agents.' })}</p>
        <label className="block text-sm">{t('plan')}<select className="mt-1 w-full rounded border bg-background p-2" value={plan?.id ?? ''} onChange={event => { setPlanId(event.target.value); setSelectedId('') }}>{state.snapshot?.plans.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      </>}
      <div className="flex flex-wrap gap-2">{(['steps', 'topology', 'branches', 'annotations'] as const).map(mode => <Button key={mode} variant={view === mode ? 'default' : 'outline'} aria-pressed={view === mode} onClick={() => { setView(mode); if (mode === 'annotations') setLogOpened(true) }}>{t(`productionView.${mode}`, { defaultValue: mode === 'steps' ? 'Steps' : mode === 'branches' ? 'Branch plan' : mode === 'annotations' ? 'Annotating' : 'Build topology' })}</Button>)}</div>
      {!connected && view !== 'annotations' && <p role="status" className="text-sm">{t('productionOffline', { defaultValue: 'Connect through Tasks to load the shared plan. Changes are disabled while offline.' })}</p>}
      {state.error && view !== 'annotations' && <p role="alert" className="break-words text-sm text-destructive">{state.error}</p>}
    </header>
    <div className="flex-1 space-y-4 overflow-auto p-4">
      <div hidden={view !== 'annotations'}>{logOpened && <ProductionLog />}</div>
      <div hidden={view === 'annotations'} className="space-y-4">
      {view === 'steps' ? <ol className="space-y-2">{ordered.map((task, index) => <li key={task.id}><button className="w-full rounded-lg border p-3 text-left hover:bg-muted" aria-pressed={selectedId === task.id} onClick={() => setSelectedId(task.id)}><span className="font-medium">{index + 1}. {task.title}</span><span className="block text-xs text-muted-foreground">{task.status} · {task.role}</span></button></li>)}</ol>
        : view === 'branches' ? <ProductionBranchMap tasks={tasks} selectedId={selectedId} onSelect={setSelectedId} /> : <div className="space-y-4">
          {tasks.length > 0 && <RenderMarkdown content={`\`\`\`mermaid\n${productionTopology(tasks)}\n\`\`\``} isAnimating={false} />}
          <p className="text-xs text-muted-foreground">{t('productionGitHistory', { defaultValue: 'Arrows show task prerequisites. Git branch and merge history will appear separately when verified repository history is available.' })}</p>
          <div className="flex gap-4 overflow-x-auto" aria-label={t('productionTopology', { defaultValue: 'Task dependency branches' })}>{columns.map((column, index) => <div key={index} className="min-w-48 flex-1 space-y-3">{column.map(task => <button key={task.id} className="block w-full rounded-lg border p-3 text-left hover:bg-muted" onClick={() => setSelectedId(task.id)}><span className="block font-medium">{task.title}</span><span className="block text-xs text-muted-foreground">{task.status} · {task.role}</span>{task.dependencies.length > 0 && <span className="mt-2 block text-xs">{t('depends')}: {task.dependencies.map(id => names.get(id) ?? id).join(', ')}</span>}</button>)}</div>)}</div>
        </div>}
      {tasks.length === 0 && <p className="text-sm text-muted-foreground">{t('productionEmpty', { defaultValue: 'No production steps yet. Create an agreed plan in Tasks.' })}</p>}
      {selected && <section className="space-y-3" aria-label={t('details')}>
        <div className="space-y-2 rounded-lg border p-3 text-xs">
          <p>{t('role')}: {selected.role} · {selected.status}</p>
          <p>{t('depends')}: {selected.dependencies.length ? selected.dependencies.map(id => `${names.get(id) ?? id} (${tasks.find(task => task.id === id)?.status ?? t('productionMissingPrerequisite', { defaultValue: 'not in this plan' })})`).join(', ') : t('independent')}</p>
          <p className="whitespace-pre-wrap">{t('scope')}: {selected.write_scopes.length ? selected.write_scopes.join('\n') : t('readOnly')}</p>
          {activeAttempt && <p role="status">{t('productionAttemptBlocksEdit', { defaultValue: 'A running or uncertain attempt blocks edits. Finish or reconcile that attempt before changing its instructions.' })}</p>}
          <h3 className="font-medium">{t('attempts')}</h3>
          {attempts.map(attempt => <p key={attempt.id} className="break-words">{attempt.id} · {attempt.model} · {attempt.status}</p>)}
          {!attempts.length && <p>{t('productionNoAttempts', { defaultValue: 'No recorded attempts' })}</p>}
          <h3 className="font-medium">{t('artifacts')}</h3>
          {state.snapshot?.artifacts.filter(artifact => artifact.task_id === selected.id).map(artifact => <p key={artifact.id} className="break-all">{artifact.kind} · {artifact.path} · {artifact.validated ? t('verified') : t('unverified')}</p>)}
          {!state.snapshot?.artifacts.some(artifact => artifact.task_id === selected.id) && <p>{t('productionNoEvidence', { defaultValue: 'No recorded evidence' })}</p>}
        </div>
        <StepEditor key={selected.id} task={selected} editable={editable && ['planned', 'ready', 'blocked', 'failed'].includes(selected.status) && !activeAttempt} />
      </section>}
      </div>
    </div>
  </section>
}
