import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useMessageExecutionRoute } from '../useMessageExecutionRoute'
import { useGeneralSetting } from '../useGeneralSetting'
import { useAgentProvider } from '../useAgentProvider'

vi.mock('../useAgentProvider', () => ({
  useAgentProvider: vi.fn(),
}))

describe('useMessageExecutionRoute', () => {
  beforeEach(() => {
    useGeneralSetting.setState({
      legacyChatEngine: false,
      agentModeEnabled: false,
    })
    vi.mocked(useAgentProvider).mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('routes to chat by default when legacyChatEngine and agentModeEnabled are false', () => {
    const { result } = renderHook(() => useMessageExecutionRoute())
    expect(result.current).toStrictEqual({ route: 'chat-transport', reason: 'default-chat' })
  })

  it('routes to chat when legacyChatEngine is true, ignoring agent mode', () => {
    useGeneralSetting.setState({
      legacyChatEngine: true,
      agentModeEnabled: true,
    })
    const { result } = renderHook(() => useMessageExecutionRoute())
    expect(result.current).toStrictEqual({ route: 'chat-transport', reason: 'legacy-setting' })
  })

  it('routes to agent when agentModeSelected is true and no provider block applies', () => {
    useGeneralSetting.setState({
      agentModeEnabled: true,
    })
    vi.mocked(useAgentProvider).mockReturnValue({
      provider: 'llamacpp',
      models: [],
    })

    const { result } = renderHook(() => useMessageExecutionRoute())
    expect(result.current).toStrictEqual({ route: 'agent-ipc', reason: 'user-selected-agent' })
  })

  it('routes to chat with provider-unsupported reason when provider is missing', () => {
    useGeneralSetting.setState({
      agentModeEnabled: true,
    })
    vi.mocked(useAgentProvider).mockReturnValue(undefined)

    const { result } = renderHook(() => useMessageExecutionRoute())
    expect(result.current).toStrictEqual({ route: 'chat-transport', reason: 'provider-unsupported' })
  })

  it('routes to chat with provider-unsupported reason when provider is not agent capable', () => {
    useGeneralSetting.setState({
      agentModeEnabled: true,
    })
    vi.mocked(useAgentProvider).mockReturnValue({
      provider: 'foundation-models',
      models: [],
    })

    const { result } = renderHook(() => useMessageExecutionRoute())
    expect(result.current).toStrictEqual({ route: 'chat-transport', reason: 'provider-unsupported' })
  })

  it('routes to chat with missing-api-key reason when remote provider lacks key', () => {
    useGeneralSetting.setState({
      agentModeEnabled: true,
    })
    vi.mocked(useAgentProvider).mockReturnValue({
      provider: 'openai',
      api_key: '',
      models: [],
    })

    const { result } = renderHook(() => useMessageExecutionRoute())
    expect(result.current).toStrictEqual({ route: 'chat-transport', reason: 'missing-api-key' })
  })

  it('routes to chat with dflash reason when dflash is enabled for llamacpp-upstream', () => {
    useGeneralSetting.setState({
      agentModeEnabled: true,
    })
    vi.mocked(useAgentProvider).mockReturnValue({
      provider: 'llamacpp-upstream',
      models: [],
      settings: [
        {
          key: 'dflash',
          name: 'dflash',
          type: 'boolean',
          description: '',
          controller_type: 'checkbox',
          controller_props: { value: true }
        }
      ]
    })

    const { result } = renderHook(() => useMessageExecutionRoute())
    expect(result.current).toStrictEqual({ route: 'chat-transport', reason: 'dflash' })
  })
})
