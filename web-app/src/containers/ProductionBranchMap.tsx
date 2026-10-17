import { useId } from 'react'
import type { ControlTask } from '@/lib/atomic-control'
import { taskColumns } from '@/lib/atomic-control'
import { useTranslation } from '@/i18n/react-i18next-compat'

/** Proposed branches only. A completed task is never represented as a Git commit. */
export function ProductionBranchMap({ tasks, selectedId, onSelect }: {
  tasks: ControlTask[]; selectedId: string; onSelect: (id: string) => void
}) {
  const { t } = useTranslation('atomic-tasks')
  const titleId = useId()
  const columns = taskColumns(tasks)
  const ordered = columns.flat()
  const positions = new Map(columns.flatMap((column, depth) => column.map(task => [task.id, { x: 160 + depth * 240, y: 92 + ordered.indexOf(task) * 76 }] as const)))
  const width = Math.max(640, 400 + columns.length * 240)
  const height = Math.max(180, ordered.length * 76 + 90)
  return <section className="space-y-2" aria-label={t('productionBranches', { defaultValue: 'Proposed branch map' })}>
    <p className="text-xs text-muted-foreground">{t('productionBranchNotice', { defaultValue: 'Proposed branches and prerequisite joins for review. These are planning suggestions, not repository branches, commits, or completed merges. Select a step to edit its requirements below.' })}</p>
    <div className="max-h-96 overflow-auto rounded-lg border">
      <svg width={width} height={height} role="group" aria-labelledby={titleId}>
        <title id={titleId}>{t('productionBranches', { defaultValue: 'Proposed branch map' })}</title>
        <path d={`M 28 40 H ${width - 28}`} className="stroke-muted-foreground" fill="none" strokeWidth="2" />
        <text x="36" y="28" className="fill-muted-foreground text-xs">{t('productionProposedBase', { defaultValue: 'Proposed integration line — base not selected' })}</text>
        {ordered.map(task => {
          const point = positions.get(task.id)!
          const missing = task.dependencies.filter(id => !positions.has(id))
          return <g key={task.id}>
            <path d={`M 40 40 C 40 ${point.y}, ${point.x - 70} ${point.y}, ${point.x} ${point.y} H ${width - 64} Q ${width - 28} ${point.y}, ${width - 28} 40`} fill="none" className="stroke-muted-foreground/50" strokeWidth="1.5" strokeDasharray="5 5" />
            {task.dependencies.map(id => {
              const predecessor = positions.get(id)
              return predecessor && <path key={id} d={`M ${predecessor.x} ${predecessor.y + 16} C ${predecessor.x} ${point.y - 30}, ${point.x} ${predecessor.y + 30}, ${point.x} ${point.y - 16}`} fill="none" className="stroke-primary" strokeDasharray="3 3"><title>{t('productionPlannedJoin', { defaultValue: 'Planned prerequisite join' })}: {tasks.find(item => item.id === id)?.title} → {task.title}</title></path>
            })}
            <g role="button" tabIndex={0} aria-label={`${t('productionProposedBranch', { defaultValue: 'Proposed branch' })}: ${task.title}`} aria-pressed={selectedId === task.id} className="group cursor-pointer outline-none" onClick={() => onSelect(task.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(task.id) } }}>
              <title>{task.title} · {task.status}{missing.length ? ` · ${t('depends')}: ${missing.join(', ')}` : ''}</title>
              <rect x={point.x - 10} y={point.y - 24} width="222" height="52" rx="8" className={`fill-background group-focus-visible:stroke-primary ${selectedId === task.id ? 'stroke-primary' : 'stroke-muted-foreground'}`} strokeWidth="2" />
              <circle cx={point.x} cy={point.y} r="5" className="fill-primary" />
              <text x={point.x + 14} y={point.y - 5} className="fill-foreground text-xs">{task.title.length > 27 ? `${task.title.slice(0, 26)}…` : task.title}</text>
              <text x={point.x + 14} y={point.y + 13} className="fill-muted-foreground text-xs">{task.status} · {task.role}</text>
            </g>
          </g>
        })}
      </svg>
    </div>
  </section>
}
