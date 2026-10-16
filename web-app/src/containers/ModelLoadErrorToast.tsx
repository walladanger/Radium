/**
 * Toast for a failed model load.
 *
 * The engines hand us the whole `llama-server` output on a crash, and pasting
 * that into the toast description buried the one sentence that mattered under a
 * hundred lines of log (a screenful of GGML backtrace on first launch). This
 * renders the sentence and keeps the log one click away — still copyable, since
 * it is exactly what a bug report needs.
 */
import type { CSSProperties } from 'react'
import { toast } from 'sonner'
import { ModelLoadErrorBody } from './ModelLoadErrorBody'

/** Shared with every other model-load toast so they replace one another. */
const TOAST_ID = 'model-load-error'
const DEFAULT_DURATION_MS = 10_000
/** Expanded, the toast needs more room than the default 356px column. */
const EXPANDED_WIDTH = '440px'

export interface ModelLoadErrorToastOptions {
  title: string
  description: string
  /** Raw engine output, hidden behind the toggle. */
  details?: string
  duration?: number
}

export function showModelLoadErrorToast(
  options: ModelLoadErrorToastOptions
): void {
  renderToast(options, false)
}

function renderToast(
  options: ModelLoadErrorToastOptions,
  expanded: boolean
): void {
  toast.error(options.title, {
    id: TOAST_ID,
    // A log being read must not vanish mid-scroll, so expanding pins the toast.
    duration: expanded ? Infinity : (options.duration ?? DEFAULT_DURATION_MS),
    closeButton: true,
    style: expanded
      ? ({ '--width': EXPANDED_WIDTH } as CSSProperties)
      : undefined,
    description: (
      <ModelLoadErrorBody
        description={options.description}
        details={options.details}
        expanded={expanded}
        onToggle={() => renderToast(options, !expanded)}
      />
    ),
  })
}
