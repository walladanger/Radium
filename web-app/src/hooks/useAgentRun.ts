import { create } from 'zustand'
import type {
  AgentEvent,
  AgentRunState,
  AgentRunToolTrace,
  AgentSpecialistLane,
} from '@/types/agent'

/** Longest text kept per lane; older output scrolls away. */
const MAX_LANE_TEXT = 20_000

function capLaneText(text: string): string {
  return text.length > MAX_LANE_TEXT ? text.slice(-MAX_LANE_TEXT) : text
}

function updateLane(
  state: AgentRunState,
  laneId: string,
  update: (lane: AgentSpecialistLane) => AgentSpecialistLane
): AgentRunState {
  const lanes = state.lanes ?? []
  if (!lanes.some((lane) => lane.laneId === laneId)) return state
  return {
    ...state,
    lanes: lanes.map((lane) => (lane.laneId === laneId ? update(lane) : lane)),
  }
}

/**
 * Folds one event of a specialist's nested turn into its lane. Only what a
 * lane shows is kept: streamed reasoning and answer text, and tool calls.
 * Lifecycle and approval events stay with the coordinator's run.
 */
export function reduceSpecialistLane(
  lane: AgentSpecialistLane,
  event: AgentEvent
): AgentSpecialistLane {
  switch (event.type) {
    case 'step_started':
      // Each step restarts the streamed answer; keep the trail of reasoning.
      return { ...lane, text: '' }
    case 'reasoning_delta':
      return { ...lane, reasoning: capLaneText(lane.reasoning + event.text) }
    case 'assistant_delta':
      return { ...lane, text: capLaneText(lane.text + event.text) }
    case 'assistant_reply':
      return { ...lane, text: capLaneText(event.text) }
    case 'tool_call_parsed':
      return {
        ...lane,
        tools: [
          ...lane.tools,
          {
            call: event.call,
            batchIndex: event.batch_index,
            batchSize: event.batch_size,
          },
        ],
      }
    case 'tool_call_executed':
      return { ...lane, tools: replaceParsedTool(lane.tools, event) }
    default:
      return lane
  }
}

export function createAgentRunState(): AgentRunState {
  return {
    status: 'idle',
    approvalResolving: false,
    folderAccessResolving: false,
    trace: {
      reasoning: {},
      assistantText: '',
      tools: [],
      loops: [],
    },
  }
}

function replaceParsedTool(
  tools: AgentRunToolTrace[],
  event: Extract<AgentEvent, { type: 'tool_call_executed' }>
): AgentRunToolTrace[] {
  const index = (() => {
    for (let candidate = tools.length - 1; candidate >= 0; candidate -= 1) {
      const item = tools[candidate]
      if (
        item.outcome === undefined &&
        item.batchIndex === event.result.batch_index &&
        item.batchSize === event.result.batch_size &&
        item.call.tool === event.result.call.tool
      ) {
        return candidate
      }
    }
    return -1
  })()
  const executed: AgentRunToolTrace = {
    call: event.result.call,
    outcome: event.result.outcome,
    batchIndex: event.result.batch_index,
    batchSize: event.result.batch_size,
  }
  if (index < 0) {
    return [...tools, executed]
  }
  return tools.map((item, itemIndex) => (itemIndex === index ? executed : item))
}

export function reduceAgentRunState(
  state: AgentRunState,
  event: AgentEvent,
  nowMs: number = Date.now()
): AgentRunState {
  switch (event.type) {
    case 'turn_started':
      return {
        ...createAgentRunState(),
        runId: event.run_id,
        startedAtMs: state.startedAtMs ?? nowMs,
        status: 'running',
      }
    case 'context_usage':
      return { ...state, contextUsage: { categories: event.categories, contextWindow: event.context_window ?? undefined, updatedAt: nowMs, estimated: true } }
    case 'step_started':
      return {
        ...state,
        status: 'running',
      }
    case 'reasoning_delta':
      return {
        ...state,
        trace: {
          ...state.trace,
          reasoning: {
            ...state.trace.reasoning,
            [event.step_index]:
              (state.trace.reasoning[event.step_index] ?? '') + event.text,
          },
        },
      }
    case 'assistant_delta':
      return {
        ...state,
        trace: {
          ...state.trace,
          assistantText: state.trace.assistantText + event.text,
        },
      }
    case 'tool_call_parsed':
      return {
        ...state,
        trace: {
          ...state.trace,
          tools: [
            ...state.trace.tools,
            {
              call: event.call,
              batchIndex: event.batch_index,
              batchSize: event.batch_size,
            },
          ],
        },
      }
    case 'tool_call_executed':
      return {
        ...state,
        status: 'running',
        pendingApproval: undefined,
        pendingFolderAccess: undefined,
        approvalResolving: false,
        folderAccessResolving: false,
        trace: {
          ...state.trace,
          tools: replaceParsedTool(state.trace.tools, event),
        },
      }
    case 'approval_requested':
      return {
        ...state,
        status: 'awaiting_approval',
        pendingApproval: event,
        approvalResolving: false,
      }
    case 'folder_access_requested':
      return {
        ...state,
        status: 'awaiting_folder_access',
        pendingFolderAccess: event,
        folderAccessResolving: false,
      }
    case 'loop_detected':
      return {
        ...state,
        trace: {
          ...state.trace,
          loops: [
            ...state.trace.loops,
            {
              level: event.level,
              detector: event.detector,
              message: event.message,
            },
          ],
        },
      }
    case 'parse_retry':
    case 'batch_trimmed':
      return state
    case 'assistant_reply':
      return {
        ...state,
        trace: {
          ...state.trace,
          assistantText: event.text,
        },
      }
    case 'step_error':
      return {
        ...state,
        status: 'failed',
        pendingApproval: undefined,
        pendingFolderAccess: undefined,
        approvalResolving: false,
        folderAccessResolving: false,
        trace: {
          ...state.trace,
          error: {
            category: event.category,
            message: event.message,
          },
        },
      }
    case 'specialist_started':
      return {
        ...state,
        lanes: [
          ...(state.lanes ?? []),
          {
            laneId: event.lane_id,
            specialist: event.specialist,
            modelId: event.model_id,
            task: event.task,
            status: 'running',
            reasoning: '',
            text: '',
            tools: [],
            startedAtMs: nowMs,
          },
        ],
      }
    case 'specialist_event':
      return updateLane(state, event.lane_id, (lane) =>
        reduceSpecialistLane(lane, event.event)
      )
    case 'specialist_finished':
      return updateLane(state, event.lane_id, (lane) => ({
        ...lane,
        status: event.ok ? 'done' : 'failed',
        summary: event.summary,
        finishedAtMs: nowMs,
      }))
    case 'turn_finished': {
      const status =
        event.reason === 'cancelled'
          ? 'cancelled'
          : event.reason === 'failed'
            ? 'failed'
            : 'finished'
      return {
        ...state,
        finishedAtMs: nowMs,
        usage: event.usage ?? state.usage,
        status,
        pendingApproval: undefined,
        pendingFolderAccess: undefined,
        approvalResolving: false,
        folderAccessResolving: false,
        trace: {
          ...state.trace,
          finishReason: event.reason,
          stepCount: event.step_count,
        },
      }
    }
  }
}

type AgentRunStore = {
  runs: Record<string, AgentRunState>
  getRun: (threadId: string) => AgentRunState
  startRun: (threadId: string, runId: string) => void
  applyEvent: (threadId: string, event: AgentEvent) => void
  setApprovalResolving: (threadId: string, resolving: boolean) => void
  setFolderAccessResolving: (threadId: string, resolving: boolean) => void
  clearPendingApproval: (threadId: string, approvalId: string) => void
  clearPendingFolderAccess: (threadId: string, accessId: string) => void
  clearRun: (threadId: string) => void
  clearAll: () => void
}

export const useAgentRun = create<AgentRunStore>()((set, get) => ({
  runs: {},
  getRun: (threadId) => get().runs[threadId] ?? createAgentRunState(),
  startRun: (threadId, runId) => {
    set((state) => ({
      runs: {
        ...state.runs,
        [threadId]: {
          ...createAgentRunState(),
          runId,
          startedAtMs: Date.now(),
          status: 'running',
        },
      },
    }))
  },
  applyEvent: (threadId, event) => {
    set((state) => ({
      runs: {
        ...state.runs,
        [threadId]: reduceAgentRunState(
          state.runs[threadId] ?? createAgentRunState(),
          event
        ),
      },
    }))
  },
  setApprovalResolving: (threadId, resolving) => {
    set((state) => {
      const run = state.runs[threadId]
      if (!run) return state
      return {
        runs: {
          ...state.runs,
          [threadId]: {
            ...run,
            approvalResolving: resolving,
          },
        },
      }
    })
  },
  setFolderAccessResolving: (threadId, resolving) => {
    set((state) => {
      const run = state.runs[threadId]
      if (!run) return state
      return {
        runs: {
          ...state.runs,
          [threadId]: {
            ...run,
            folderAccessResolving: resolving,
          },
        },
      }
    })
  },
  clearPendingApproval: (threadId, approvalId) => {
    set((state) => {
      const run = state.runs[threadId]
      if (!run || run.pendingApproval?.approval_id !== approvalId) return state
      return {
        runs: {
          ...state.runs,
          [threadId]: {
            ...run,
            status: run.status === 'awaiting_approval' ? 'running' : run.status,
            pendingApproval: undefined,
            approvalResolving: false,
          },
        },
      }
    })
  },
  clearPendingFolderAccess: (threadId, accessId) => {
    set((state) => {
      const run = state.runs[threadId]
      if (!run || run.pendingFolderAccess?.access_id !== accessId) return state
      return {
        runs: {
          ...state.runs,
          [threadId]: {
            ...run,
            status:
              run.status === 'awaiting_folder_access' ? 'running' : run.status,
            pendingFolderAccess: undefined,
            folderAccessResolving: false,
          },
        },
      }
    })
  },
  clearRun: (threadId) => {
    set((state) => {
      const runs = { ...state.runs }
      delete runs[threadId]
      return { runs }
    })
  },
  clearAll: () => set({ runs: {} }),
}))
