/** Observed controller stages, shared by native lanes and the optional AG-UI feed. */
export const atomicStages = ['model', 'tool', 'preparing_tool', 'tool_finished', 'verification', 'awaiting_checks', 'agent_stopped'] as const
export const isAtomicStage = (value: unknown): value is typeof atomicStages[number] =>
  typeof value === 'string' && atomicStages.some(stage => stage === value)
