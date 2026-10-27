import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ulid } from 'ulidx'

import { SCHEDULE_TICK_MS, useContinuousSessions } from '../continuous-session-store'
import type { ContinuousSession } from '@/services/media/continuous/session'

// Mocks hoisted correctly using vi.hoisted
const {
  mockInvoke,
  mockMediaJobManagerGet,
  mockMediaJobManagerSubscribe,
  mockMediaJobManagerCanCancel,
  mockMediaJobManagerCancel,
  mockMediaJobManagerSubmit,
  mockMaterialize,
  mockExtractLastFrame,
  mockRefresh,
  mockAddToLibrary,
  mockGenerateMediaForChat
} = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockMediaJobManagerGet: vi.fn(),
  mockMediaJobManagerSubscribe: vi.fn(),
  mockMediaJobManagerCanCancel: vi.fn(),
  mockMediaJobManagerCancel: vi.fn(),
  mockMediaJobManagerSubmit: vi.fn(),
  mockMaterialize: vi.fn(),
  mockExtractLastFrame: vi.fn().mockResolvedValue('data:image/png;base64,mock'),
  mockRefresh: vi.fn().mockResolvedValue(undefined),
  mockAddToLibrary: vi.fn().mockResolvedValue(undefined),
  mockGenerateMediaForChat: vi.fn()
}))

vi.mock('@/hooks/useServiceHub', () => ({
  getServiceHub: () => ({
    core: () => ({
      invoke: mockInvoke,
    }),
  }),
}))

vi.mock('@/stores/media-library-store', () => {
  return {
    coreMediaFileSystem: {
      join: (...args: string[]) => args.join('/'),
      exists: async () => true,
      mkdir: async () => {},
      readText: async () => JSON.stringify({schedules: []}),
      writeBytes: async () => {},
      rename: async () => {},
      remove: async () => {},
      size: async () => 0,
    },
    mediaDataFolder: async () => '/data',
  }
})

vi.mock('@/services/media/jobManager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/media/jobManager')>()
  return {
    ...actual,
    mediaJobManager: {
      get: mockMediaJobManagerGet,
      store: {
        subscribe: mockMediaJobManagerSubscribe,
      },
      canCancel: mockMediaJobManagerCanCancel,
      cancel: mockMediaJobManagerCancel,
      submit: mockMediaJobManagerSubmit,
    },
  }
})

vi.mock('@/services/media/assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/media/assets')>()
  return {
    ...actual,
    materialize: mockMaterialize,
    MEDIA_FOLDER: 'media',
  }
})

vi.mock('@/services/media/chatGeneration', () => ({
  defaultChatGenerationDeps: async () => ({
    appVersion: '1.0.0',
    manager: {
      get: mockMediaJobManagerGet,
      store: {
        subscribe: mockMediaJobManagerSubscribe,
      },
      canCancel: mockMediaJobManagerCanCancel,
      cancel: mockMediaJobManagerCancel,
      submit: mockMediaJobManagerSubmit,
    },
    extractLastFrame: mockExtractLastFrame,
    capabilities: () => ({ 'test-provider': { features: {} } }),
    refresh: mockRefresh,
    materializeDeps: {},
    addToLibrary: mockAddToLibrary,
  }),
  resolveChatRequest: (task: string, prompt: string) => ({
    request: {
      task,
      provider_id: 'test-provider',
      model_id: 'test-model',
      client_job_id: `job-${ulid()}`,
      params: {},
    },
    model: { label: 'Test Model' },
  }),
  generateMediaForChat: mockGenerateMediaForChat,
}))

describe('continuous-session-store', () => {
  const initialState = useContinuousSessions.getState()

  beforeEach(() => {
    vi.useFakeTimers()
    useContinuousSessions.setState(initialState, true)

    mockInvoke.mockReset()
    mockMediaJobManagerGet.mockReset()
    mockMediaJobManagerSubscribe.mockReset()
    mockMediaJobManagerCanCancel.mockReset()
    mockMediaJobManagerCancel.mockReset()
    mockMediaJobManagerSubmit.mockReset()
    mockMaterialize.mockReset()
    mockExtractLastFrame.mockClear()
    mockRefresh.mockClear()
    mockAddToLibrary.mockClear()
    mockGenerateMediaForChat.mockReset()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('can create a session', async () => {
    const store = useContinuousSessions.getState()
    const session: ContinuousSession = {
      id: 'session-1',
      name: 'Test Session',
      created_at: Date.now(),
      updated_at: Date.now(),
      segments: [],
      steps: [],
      status: 'draft',
      stitch: false,
    }

    await store.saveSession(session)

    expect(useContinuousSessions.getState().sessions).toEqual([session])
  })

  it('can create a schedule and fire it when due', async () => {
    const store = useContinuousSessions.getState()
    await store.load()

    const session: ContinuousSession = {
      id: 'session-1',
      name: 'Test Session',
      created_at: Date.now(),
      updated_at: Date.now(),
      segments: [],
      steps: [],
      status: 'draft',
      stitch: false,
    }
    await store.saveSession(session)

    const scheduleData = {
      label: 'Test Schedule',
      target: { kind: 'session' as const, session_id: 'session-1' },
      at: Date.now() + SCHEDULE_TICK_MS - 100,
      repeat: 'none' as const,
      enabled: true,
    }

    await store.addSchedule(scheduleData)

    const schedules = useContinuousSessions.getState().schedules
    expect(schedules.length).toBe(1)
    expect(schedules[0].enabled).toBe(true)

    // Should not fire yet
    await vi.advanceTimersByTimeAsync(100)
    expect(useContinuousSessions.getState().sessions[0].status).toBe('draft')

    // Set up start mock basically by providing a mock subscribe implementation
    // and wait for start to complete which sets state to succeeded due to no steps
    mockMediaJobManagerSubscribe.mockImplementation(() => () => {})

    // Advance past the next tick
    await vi.advanceTimersByTimeAsync(SCHEDULE_TICK_MS)

    expect(useContinuousSessions.getState().sessions[0].status).toBe('succeeded')
    expect(useContinuousSessions.getState().schedules[0].enabled).toBe(false)
  })

  it('can stop and remove a session', async () => {
    const store = useContinuousSessions.getState()
    const session: ContinuousSession = {
      id: 'session-2',
      name: 'Test Session 2',
      created_at: Date.now(),
      updated_at: Date.now(),
      segments: [],
      steps: [],
      status: 'scheduled',
      stitch: false,
    }

    await store.saveSession(session)
    expect(useContinuousSessions.getState().sessions.length).toBe(1)

    store.pause('session-2')
    expect(useContinuousSessions.getState().sessions[0].status).toBe('paused')

    // Test canceling from scheduled rather than paused
    const sessionScheduled: ContinuousSession = {
      ...session,
      id: 'session-cancel',
      status: 'scheduled',
    }
    await store.saveSession(sessionScheduled)

    store.cancel('session-cancel')
    expect(useContinuousSessions.getState().sessions[0].status).toBe('cancelled')

    await store.removeSession('session-cancel')
    expect(useContinuousSessions.getState().sessions.length).toBe(1)
  })

  it('terminal job state ends a run as implemented', async () => {
    const store = useContinuousSessions.getState()
    const session: ContinuousSession = {
      id: 'session-3',
      name: 'Test Session 3',
      created_at: Date.now(),
      updated_at: Date.now(),
      segments: [
        {
          id: 'seg-1',
          prompt: 'A prompt',
          start: { kind: 'none' },
          runs: 1,
        }
      ],
      steps: [
        {
          segment: 0,
          run: 0,
          prompt: 'A prompt',
          start: { kind: 'none' },
          params: {},
          status: 'pending'
        }
      ],
      status: 'draft',
      stitch: false,
    }

    await store.saveSession(session)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let checkFn: (() => void) | undefined
    mockMediaJobManagerSubscribe.mockImplementation((cb: () => void) => {
      checkFn = cb
      // Call it async so we don't hit initialization errors during the setup
      Promise.resolve().then(() => { if (checkFn === cb) cb() })
      return () => {}
    })

    mockMediaJobManagerSubmit.mockImplementation(async (request: any) => {
      // simulate submitting successfully then updating state
      mockMediaJobManagerGet.mockReturnValue({
        state: 'failed',
        error: { message: 'Mocked failure' },
        client_job_id: request.client_job_id,
        provider_job_id: 'p-1',
      })
      if (checkFn) checkFn()
      return undefined
    })

    // Calling store.start creates a run control and puts it in chain
    await store.start('session-3')

    // We need to resolve the promise chain which involves nested microtasks due to the store logic
    await vi.runAllTimersAsync()

    // We need to allow real promises to flush as fake timers don't clear microtask queue across async ticks
    await new Promise(resolve => process.nextTick(resolve))
    await vi.runAllTimersAsync()
    await new Promise(resolve => process.nextTick(resolve))

    // Check if the submit was called
    expect(mockMediaJobManagerSubmit).toHaveBeenCalled()

    const finishedSession = useContinuousSessions.getState().sessions.find(s => s.id === 'session-3')
    expect(finishedSession?.status).toBe('failed')
    expect(finishedSession?.steps[0].status).toBe('failed')
    expect(finishedSession?.steps[0].error).toBe('Mocked failure')
  })
})
