import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A small inline label. This repo has no shared Badge component, so panels
 * carry their own rather than adding one to the design system for three
 * call sites.
 */
export function Chip({
  children,
  tone = 'default',
}: {
  children: ReactNode
  tone?: 'default' | 'muted' | 'bad'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none',
        tone === 'default' && 'border-border bg-accent text-foreground',
        tone === 'muted' && 'border-border text-muted-foreground',
        tone === 'bad' && 'border-destructive/40 bg-destructive/10 text-destructive'
      )}
    >
      {children}
    </span>
  )
}
