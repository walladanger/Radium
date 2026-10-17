import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * What a panel prints when it has nothing to report.
 *
 * The distinction this file exists to protect: a measurement that has not
 * arrived is *not* zero. A CPU meter reading `0%` before the first sample
 * says the machine is idle, which is a claim the panel cannot make. A dash
 * says nothing, which is the truth. Every built-in panel routes its numbers
 * through `Readout` so no panel has to remember this on its own.
 */
export const NOT_AVAILABLE = '—'

export function Readout({
  label,
  value,
  mono = true,
}: {
  label: string
  /** `null`/`undefined`/`''` render as a dash. `0` renders as `0`. */
  value?: ReactNode | null
  mono?: boolean
}) {
  const missing = value === null || value === undefined || value === ''
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          'truncate text-right',
          mono && 'font-mono',
          missing && 'text-muted-foreground'
        )}
        title={missing ? 'not available' : undefined}
      >
        {missing ? NOT_AVAILABLE : value}
      </span>
    </div>
  )
}

/** A labelled group inside a panel body. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="font-semibold uppercase tracking-wide text-muted-foreground text-[10px]">
        {title}
      </h3>
      {children}
    </section>
  )
}

/** The shell every built-in uses: one loading state, one empty state. */
export function PanelBody({
  loading,
  empty,
  children,
}: {
  loading?: boolean
  empty?: ReactNode | null
  children: ReactNode
}) {
  if (loading) {
    return <div className="p-3 text-xs text-muted-foreground">Loading…</div>
  }
  if (empty) {
    return <div className="p-3 text-xs text-muted-foreground">{empty}</div>
  }
  return <div className="space-y-3 p-3 text-xs">{children}</div>
}
