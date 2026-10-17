import type { AgentSpecialist, AgentToolPack } from '@/types/agent'
import { renderInstructions } from '@/lib/instructionTemplate'
import { agentContextWindow } from '@/lib/agent-provider'

/** Matches the backend's per-turn roster limit. */
export const MAX_AGENT_SPECIALISTS = 12

type SpecialistCandidate = Pick<
  Assistant,
  | 'id'
  | 'name'
  | 'description'
  | 'instructions'
  | 'specialist'
  | 'tool_packs'
  | 'specialist_model'
>

/** Looks up a provider's model so its capabilities and context reach the backend. */
export type SpecialistModelResolver = (
  provider: string,
  modelId: string
) => Model | undefined

const KNOWN_TOOL_PACKS: readonly AgentToolPack[] = ['network']

/** The assistant's tool packs the backend knows; anything else is dropped. */
export function agentToolPacks(
  assistant: Pick<Assistant, 'tool_packs'> | undefined
): AgentToolPack[] {
  return (assistant?.tool_packs ?? []).filter((pack): pack is AgentToolPack =>
    (KNOWN_TOOL_PACKS as readonly string[]).includes(pack)
  )
}

/**
 * The specialists an agent turn may delegate to: every assistant the user
 * marked as a specialist, except the thread's own assistant (it is the
 * coordinator). An assistant without a description is skipped — the
 * coordinator would have no way to know when to use it.
 */
export function buildAgentSpecialists(
  assistants: SpecialistCandidate[],
  coordinatorId: string | undefined,
  resolveModel?: SpecialistModelResolver
): AgentSpecialist[] {
  const seen = new Set<string>()
  const specialists: AgentSpecialist[] = []
  for (const assistant of assistants) {
    if (assistant.specialist !== true || assistant.id === coordinatorId)
      continue
    const name = assistant.name.trim()
    const description = assistant.description?.trim()
    if (!name || !description) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    specialists.push({
      name,
      description,
      instructions: renderInstructions(assistant.instructions || undefined),
      tool_packs: agentToolPacks(assistant),
      ...specialistModel(assistant.specialist_model, resolveModel),
    })
    if (specialists.length === MAX_AGENT_SPECIALISTS) break
  }
  return specialists
}

/**
 * The model fields for a specialist with its own model. An unknown model is
 * still sent: the backend then fails the turn naming the specialist, which
 * beats silently running it on the coordinator's model.
 */
function specialistModel(
  ref: SpecialistCandidate['specialist_model'],
  resolveModel: SpecialistModelResolver | undefined
): Pick<
  AgentSpecialist,
  'model_id' | 'provider' | 'capabilities' | 'context_window'
> {
  const id = ref?.id?.trim()
  const provider = ref?.provider?.trim()
  if (!id || !provider) return {}
  const model = resolveModel?.(provider, id)
  return {
    model_id: id,
    provider,
    capabilities: model?.capabilities ?? [],
    context_window: agentContextWindow(model),
  }
}
