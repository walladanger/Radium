import { useEffect, useRef } from 'react'
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconLoader2,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n/react-i18next-compat'
import type { AgentSpecialistLane } from '@/types/agent'

/** Lanes shown side by side; matches the backend's parallel delegation cap. */
export const MAX_VISIBLE_LANES = 4

type Props = {
  lanes: AgentSpecialistLane[] | undefined
  className?: string
}

/**
 * One scrolling column per specialist the coordinator handed work to: its
 * task, model, live reasoning/answer and tool calls, until it finishes. The
 * newest lanes win when more than four have run in a turn.
 */
export function AgentSpecialistLanes({ lanes, className }: Props) {
  const { t } = useTranslation()
  if (!lanes || lanes.length === 0) return null
  const visible = lanes.slice(-MAX_VISIBLE_LANES)
  const hidden = lanes.length - visible.length
  return (
    <section
      aria-label={t('chat:specialistLanes.title')}
      className={cn('mb-3 flex flex-col gap-1', className)}
    >
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>{t('chat:specialistLanes.title')}</span>
        {hidden > 0 && (
          <span>{t('chat:specialistLanes.earlier', { count: hidden })}</span>
        )}
      </div>
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))`,
        }}
      >
        {visible.map((lane) => (
          <SpecialistLane key={lane.laneId} lane={lane} />
        ))}
      </div>
    </section>
  )
}

function SpecialistLane({ lane }: { lane: AgentSpecialistLane }) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  // Follow the stream like a terminal while the lane is running.
  useEffect(() => {
    const element = scrollRef.current
    if (element && lane.status === 'running') {
      element.scrollTop = element.scrollHeight
    }
  }, [lane.text, lane.reasoning, lane.tools.length, lane.status])

  const statusIcon =
    lane.status === 'running' ? (
      <IconLoader2 className="size-3.5 animate-spin" aria-hidden />
    ) : lane.status === 'done' ? (
      <IconCircleCheck className="size-3.5 text-green-600" aria-hidden />
    ) : (
      <IconAlertTriangle className="size-3.5 text-destructive" aria-hidden />
    )
  const body =
    lane.status === 'running' ? lane.text : (lane.summary ?? lane.text)

  return (
    <article
      className="flex h-72 min-w-0 flex-col rounded-md border bg-card text-card-foreground"
      data-lane-status={lane.status}
    >
      <header className="flex flex-col gap-0.5 border-b px-2 py-1.5">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {statusIcon}
          <span className="truncate" title={lane.specialist}>
            {lane.specialist}
          </span>
          <span className="sr-only">
            {t(`chat:specialistLanes.status.${lane.status}`)}
          </span>
        </div>
        <span
          className="truncate font-mono text-[11px] text-muted-foreground"
          title={lane.modelId}
        >
          {lane.modelId}
        </span>
      </header>
      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto px-2 py-1.5 text-xs"
      >
        <p className="whitespace-pre-wrap text-muted-foreground">
          <span className="font-medium">{t('chat:specialistLanes.task')}</span>{' '}
          {lane.task}
        </p>
        {lane.reasoning && (
          <p className="whitespace-pre-wrap italic text-muted-foreground/80">
            {lane.reasoning}
          </p>
        )}
        {lane.tools.length > 0 && (
          <ul className="space-y-0.5 font-mono text-[11px]">
            {lane.tools.map((tool, index) => (
              <li
                key={`${tool.call.tool}-${index}`}
                className={cn(
                  'truncate',
                  tool.outcome?.status === 'error' && 'text-destructive',
                  tool.outcome === undefined && 'text-muted-foreground'
                )}
                title={tool.outcome?.summary ?? tool.call.tool}
              >
                {tool.outcome === undefined ? '…' : '✓'} {tool.call.tool}
              </li>
            ))}
          </ul>
        )}
        {body && <p className="whitespace-pre-wrap">{body}</p>}
      </div>
    </article>
  )
}
