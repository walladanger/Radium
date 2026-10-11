/**
 * What a system-changing agent action will do, as the backend describes it
 * in an approval preview (`preview.blastRadius`, see `net::BlastRadius`).
 */
export type BlastRadius = {
  action: string
  changes: string
  disruption: string
  affects: string
  undo: string
  needsAdmin: boolean
  needsReboot: boolean
  risk: 'low' | 'medium' | 'high'
}

const RISKS = new Set(['low', 'medium', 'high'])

/** The blast radius in an approval preview, or `null` when there is none. */
export function readBlastRadius(preview: unknown): BlastRadius | null {
  if (!preview || typeof preview !== 'object') return null
  const radius = (preview as Record<string, unknown>).blastRadius
  if (!radius || typeof radius !== 'object') return null
  const value = radius as Record<string, unknown>
  const text = (key: string) =>
    typeof value[key] === 'string' ? (value[key] as string) : ''
  if (!text('action') || !RISKS.has(text('risk'))) return null
  return {
    action: text('action'),
    changes: text('changes'),
    disruption: text('disruption'),
    affects: text('affects'),
    undo: text('undo'),
    needsAdmin: value.needsAdmin === true,
    needsReboot: value.needsReboot === true,
    risk: text('risk') as BlastRadius['risk'],
  }
}
