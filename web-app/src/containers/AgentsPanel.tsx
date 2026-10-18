import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { useAtomicTasks } from '@/stores/atomic-tasks-store'
import { isAtomicStage } from '@/lib/atomic-stages'
const text = (value: unknown): string | null => typeof value === 'string' ? value : null
const lines = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
export function AgentsPanel({ active = true }: { active?: boolean }) {
  const { t } = useTranslation('workspace-panel')
  const { snapshot, connection } = useAtomicTasks()
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical')
  const [selected, setSelected] = useState('')
  const [observedNow, setObservedNow] = useState(Date.now())
  const hasActive = snapshot?.attempts.some(item => ['running', 'waiting_approval', 'verifying'].includes(item.status)) ?? false
  useEffect(() => { setObservedNow(Date.now()) }, [snapshot])
  useEffect(() => {
    if (!active || connection !== 'connected' || !hasActive) return
    const timer = setInterval(() => setObservedNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active, connection, hasActive])
  if (!snapshot) return <p className="text-sm text-muted-foreground">{t('connectHelp')}</p>
  const attempt = snapshot.attempts.find(item => item.id === selected)
  const task = snapshot.tasks.find(item => item.id === attempt?.task_id)
  const elapsed = (item: typeof snapshot.attempts[number]) => {
    const end = typeof item.finished_at === 'number' ? item.finished_at : ['running', 'waiting_approval', 'verifying'].includes(item.status) ? observedNow : null
    return end === null ? t('unavailable') : `${Math.max(0, Math.floor((end - item.created_at) / 1000))}s`
  }
  const stage = (item: typeof snapshot.attempts[number]) => {
    const observed = text(item.stage)
    const label = isAtomicStage(observed) ? t(`stages.${observed}`) : t('unavailable')
    return `${label}${typeof item.step_index === 'number' && Number.isInteger(item.step_index) && item.step_index >= 0 ? ` · ${t('step')} ${item.step_index + 1}` : ''}`
  }
  return <section className="space-y-3" aria-label={t('lanes')}>
    <div className="flex flex-wrap gap-2">{(['vertical', 'horizontal'] as const).map(value => <Button key={value} size="sm" variant={orientation === value ? 'default' : 'outline'} aria-pressed={orientation === value} onClick={() => setOrientation(value)}>{t(value)}</Button>)}</div>
    {!snapshot.workers.length && <p className="text-sm text-muted-foreground">{t('noWorkers')}</p>}
    <div className={orientation === 'horizontal' ? 'flex gap-3 overflow-x-auto pb-2' : 'grid gap-3'}>
      {snapshot.workers.map(worker => {
        const records = snapshot.attempts.filter(item => item.worker_id === worker.id).sort((a, b) => b.created_at - a.created_at)
        return <article key={worker.id} className={`rounded-lg border p-3 space-y-2 ${orientation === 'horizontal' ? 'w-72 shrink-0' : ''}`} aria-label={worker.id}>
          <h3 className="font-medium break-words">{worker.id}</h3><p className="text-xs text-muted-foreground break-words">{worker.model} · {worker.host_id} · {worker.status}</p>
          <p className="text-xs">{t('roles')}: {worker.capabilities.join(', ')}</p>
          {!records.length && <p className="text-sm text-muted-foreground">{t('noAssignment')}</p>}
          {records.map(record => {
            const assigned = snapshot.tasks.find(item => item.id === record.task_id)
            const prerequisites = assigned?.dependencies?.filter(id => snapshot.tasks.find(task => task.id === id)?.status !== 'completed') ?? []
            return <button key={record.id} className="block w-full rounded border p-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" aria-pressed={selected === record.id} onClick={() => setSelected(record.id)}>
              <span className="block font-medium">{assigned?.title ?? record.task_id}</span><span className="block text-xs">{record.status} · {stage(record)}</span><span className="block text-xs text-muted-foreground">{t('elapsed')}: {elapsed(record)}</span>
              {assigned?.status === 'blocked' && <span className="block text-xs">{t('blocked')}</span>}
              {prerequisites.length > 0 && <span className="block text-xs">{t('prerequisites')}: {prerequisites.map(id => snapshot.tasks.find(task => task.id === id)?.title ?? id).join(', ')}</span>}
              {record.status === 'outcome_unknown' && <span className="block text-xs">{t('uncertain')}</span>}
            </button>
          })}
        </article>
      })}
    </div>
    <div className="rounded border p-3 space-y-1"><h3 className="text-sm font-medium">{t('queue')}</h3>{snapshot.tasks.filter(item => item.status === 'ready').map(item => <p key={item.id} className="text-xs">{item.title} · {item.role}</p>)}{!snapshot.tasks.some(item => item.status === 'ready') && <p className="text-xs text-muted-foreground">{t('noQueued')}</p>}</div>
    {attempt && <section className="rounded-lg border p-3 space-y-3" aria-label={t('details')}>
      <h3 className="font-semibold">{task?.title ?? attempt.task_id}</h3><p className="text-xs break-words">{attempt.id} · {attempt.model} · {stage(attempt)}</p>
      {typeof attempt.current_tool === 'string' && /^[a-zA-Z0-9_.:-]{1,80}$/.test(attempt.current_tool) && <p className="text-xs">{t('currentTool')}: {attempt.current_tool}</p>}
      {typeof attempt.step_count === 'number' && Number.isInteger(attempt.step_count) && attempt.step_count >= 0 && <p className="text-xs">{t('recordedSteps')}: {attempt.step_count}</p>}
      <h4 className="text-sm font-medium">{t('instructions')}</h4><p className="whitespace-pre-wrap text-sm">{task?.description || t('unavailable')}</p>{lines(task?.instructions).map((line, index) => <p key={index} className="text-sm whitespace-pre-wrap">{line}</p>)}
      <h4 className="text-sm font-medium">{t('criteria')}</h4>{lines(task?.acceptance_criteria).length ? lines(task?.acceptance_criteria).map((line, index) => <p key={index} className="text-sm">{line}</p>) : <p className="text-xs text-muted-foreground">{t('unavailable')}</p>}
      <h4 className="text-sm font-medium">{t('artifacts')}</h4>{snapshot.artifacts.filter(item => item.attempt_id === attempt.id).map(item => <p key={item.id} className="text-xs break-all">{item.kind} · {item.path} · {item.validated ? t('validated') : t('unvalidated')}</p>)}{!snapshot.artifacts.some(item => item.attempt_id === attempt.id) && <p className="text-xs text-muted-foreground">{t('noArtifacts')}</p>}
      <h4 className="text-sm font-medium">{t('activity')}</h4>
      {snapshot.tool_executions?.filter(item => item.attempt_id === attempt.id).sort((a, b) => a.started_at - b.started_at).map(item => <details key={item.id} className="rounded border p-2 text-xs">
        <summary className="cursor-pointer break-words">{item.id} · {item.status}</summary>
        <p>{t('started')}: {new Date(item.started_at).toLocaleString()}</p>
        {typeof item.finished_at === 'number' && <p>{t('finished')}: {new Date(item.finished_at).toLocaleString()}</p>}
        {typeof item.exit_code === 'number' && <p>{t('exitCode')}: {item.exit_code}</p>}
        <p className="text-muted-foreground">{t('outputUnavailable')}</p>
      </details>)}
      {!snapshot.tool_executions?.some(item => item.attempt_id === attempt.id) && <p className="text-xs text-muted-foreground">{t('activityUnavailable')}</p>}
      <h4 className="text-sm font-medium">{t('approvals')}</h4>
      {snapshot.approvals?.filter(item => item.attempt_id === attempt.id).map(item => <details key={item.id} className="rounded border p-2 text-xs"><summary className="cursor-pointer">{item.kind} · {item.status}</summary><p className="whitespace-pre-wrap">{item.description}</p></details>)}
      {!snapshot.approvals?.some(item => item.attempt_id === attempt.id) && <p className="text-xs text-muted-foreground">{t('noApprovals')}</p>}
      <p className="text-xs text-muted-foreground">{t('summariesUnavailable')}</p>
    </section>}
  </section>
}
