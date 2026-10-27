import { describe, it, expect, vi } from 'vitest'
import { resolveThreadExecutionRoute } from '../thread-execution-route'

const mockGeneralSetting = vi.hoisted(() => ({
  legacyChatEngine: false,
  agentModeEnabled: false,
}))

const mockModelProviderState = vi.hoisted(() => ({
  selectedProvider: 'openai',
  getProviderByName: (name: string) => {
    if (name === 'openai') return { provider: 'openai', settings: {} }
    return undefined
  },
}))

const mockProviderBlockReason = vi.hoisted(() => {
  let reason: string | null = null
  return {
    get: () => reason,
    set: (val: string | null) => {
      reason = val
    },
  }
})

const mockSuppressToolsDflash = vi.hoisted(() => {
  let suppress = false
  return {
    get: () => suppress,
    set: (val: boolean) => {
      suppress = val
    },
  }
})

vi.mock('@/hooks/useGeneralSetting', () => ({
  useGeneralSetting: {
    getState: () => mockGeneralSetting,
  },
}))

vi.mock('@/hooks/useModelProvider', () => ({
  useModelProvider: {
    getState: () => mockModelProviderState,
  },
}))

vi.mock('@/lib/agent-provider', () => ({
  agentProviderBlockReason: () => mockProviderBlockReason.get(),
}))

vi.mock('@/lib/custom-chat-transport', () => ({
  shouldSuppressToolsForUpstreamDflash: () => mockSuppressToolsDflash.get(),
}))

describe('resolveThreadExecutionRoute', () => {
  it('returns default chat route when agent mode is off', () => {
    mockGeneralSetting.agentModeEnabled = false
    mockGeneralSetting.legacyChatEngine = false
    mockProviderBlockReason.set(null)
    mockSuppressToolsDflash.set(false)

    const result = resolveThreadExecutionRoute('thread-123')
    expect(result).toEqual({ route: 'chat-transport', reason: 'default-chat' })
  })

  it('returns legacy setting route when legacy chat engine is forced', () => {
    mockGeneralSetting.legacyChatEngine = true

    const result = resolveThreadExecutionRoute('thread-123')
    expect(result).toEqual({ route: 'chat-transport', reason: 'legacy-setting' })
  })

  it('returns user selected agent route when agent mode is enabled', () => {
    mockGeneralSetting.legacyChatEngine = false
    mockGeneralSetting.agentModeEnabled = true
    mockProviderBlockReason.set(null)
    mockSuppressToolsDflash.set(false)

    const result = resolveThreadExecutionRoute('thread-123')
    expect(result).toEqual({ route: 'agent-ipc', reason: 'user-selected-agent' })
  })

  it('returns provider unsupported route when agent is unsupported', () => {
    mockGeneralSetting.legacyChatEngine = false
    mockGeneralSetting.agentModeEnabled = true
    mockProviderBlockReason.set('unsupported-provider')
    mockSuppressToolsDflash.set(false)

    const result = resolveThreadExecutionRoute('thread-123')
    expect(result).toEqual({ route: 'chat-transport', reason: 'provider-unsupported' })
  })

  it('returns missing API key route when API key is missing', () => {
    mockGeneralSetting.legacyChatEngine = false
    mockGeneralSetting.agentModeEnabled = true
    mockProviderBlockReason.set('missing-api-key')
    mockSuppressToolsDflash.set(false)

    const result = resolveThreadExecutionRoute('thread-123')
    expect(result).toEqual({ route: 'chat-transport', reason: 'missing-api-key' })
  })

  it('returns dflash route when dflash is enabled', () => {
    mockGeneralSetting.legacyChatEngine = false
    mockGeneralSetting.agentModeEnabled = true
    mockProviderBlockReason.set(null)
    mockSuppressToolsDflash.set(true)

    const result = resolveThreadExecutionRoute('thread-123')
    expect(result).toEqual({ route: 'chat-transport', reason: 'dflash' })
  })

  it('returns audio attachment route when turn has audio', () => {
    mockGeneralSetting.legacyChatEngine = false
    mockGeneralSetting.agentModeEnabled = true
    mockProviderBlockReason.set(null)
    mockSuppressToolsDflash.set(false)

    const result = resolveThreadExecutionRoute('thread-123', { hasAudioAttachment: true })
    expect(result).toEqual({ route: 'chat-transport', reason: 'audio-attachment' })
  })
})
