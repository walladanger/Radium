import { beforeEach, describe, expect, it } from 'vitest'

import { localStorageKey } from '@/constants/localStorage'
import { useLaunchSettings } from '../launch-settings-store'

const initialState = useLaunchSettings.getState()

describe('launch-settings-store', () => {
  beforeEach(() => {
    localStorage.clear()
    useLaunchSettings.setState(initialState, true)
  })

  it('sets, replaces and clears a per-agent binary-path override', () => {
    useLaunchSettings.getState().setCustomPath('agent-1', '/usr/bin/agent')
    expect(useLaunchSettings.getState().customPaths).toStrictEqual({ 'agent-1': '/usr/bin/agent' })

    useLaunchSettings.getState().setCustomPath('agent-1', '/opt/bin/agent')
    expect(useLaunchSettings.getState().customPaths).toStrictEqual({ 'agent-1': '/opt/bin/agent' })

    useLaunchSettings.getState().setCustomPath('agent-1', '')
    expect(useLaunchSettings.getState().customPaths).toStrictEqual({})
  })

  it('maintains independence between agent ids', () => {
    useLaunchSettings.getState().setCustomPath('agent-1', '/bin/a1')
    useLaunchSettings.getState().setCustomPath('agent-2', '/bin/a2')

    expect(useLaunchSettings.getState().customPaths).toStrictEqual({
      'agent-1': '/bin/a1',
      'agent-2': '/bin/a2'
    })

    useLaunchSettings.getState().setCustomPath('agent-1', '')
    expect(useLaunchSettings.getState().customPaths).toStrictEqual({
      'agent-2': '/bin/a2'
    })
  })

  it('trims whitespace and removes key if resulting string is empty', () => {
    useLaunchSettings.getState().setCustomPath('agent-1', '  /bin/agent  ')
    expect(useLaunchSettings.getState().customPaths).toStrictEqual({ 'agent-1': '/bin/agent' })

    useLaunchSettings.getState().setCustomPath('agent-1', '   ')
    expect(useLaunchSettings.getState().customPaths).toStrictEqual({})
  })

  it('persists to and rehydrates from localStorage', async () => {
    // Persists
    useLaunchSettings.getState().setCustomPath('agent-1', '/bin/agent')

    const stored = JSON.parse(localStorage.getItem(localStorageKey.launchCustomPaths) || '{}')
    expect(stored.state.customPaths).toStrictEqual({ 'agent-1': '/bin/agent' })

    // Rehydrates
    localStorage.setItem(
      localStorageKey.launchCustomPaths,
      JSON.stringify({ state: { customPaths: { 'agent-2': '/bin/agent2' } } })
    )

    await useLaunchSettings.persist.rehydrate()
    expect(useLaunchSettings.getState().customPaths).toStrictEqual({ 'agent-2': '/bin/agent2' })
  })
})
