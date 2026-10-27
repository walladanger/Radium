import { beforeEach, describe, expect, it } from 'vitest'

import { useLaunchStore } from '../launch-store'

describe('launch store', () => {
  const initialState = useLaunchStore.getState()

  beforeEach(() => {
    useLaunchStore.setState(initialState, true)
    localStorage.clear()
  })

  it('sets installed with plain value', () => {
    useLaunchStore.getState().setInstalled({ app1: true })
    expect(useLaunchStore.getState().installed).toStrictEqual({ app1: true })
  })

  it('sets installed with updater function', () => {
    useLaunchStore.getState().setInstalled({ app1: true })
    useLaunchStore.getState().setInstalled((prev) => ({ ...prev, app2: false }))
    expect(useLaunchStore.getState().installed).toStrictEqual({
      app1: true,
      app2: false,
    })
  })

  it('sets viaWsl with plain value', () => {
    useLaunchStore.getState().setViaWsl({ agent1: true })
    expect(useLaunchStore.getState().viaWsl).toStrictEqual({ agent1: true })
  })

  it('sets viaWsl with updater function', () => {
    useLaunchStore.getState().setViaWsl({ agent1: true })
    useLaunchStore.getState().setViaWsl((prev) => ({ ...prev, agent2: true }))
    expect(useLaunchStore.getState().viaWsl).toStrictEqual({
      agent1: true,
      agent2: true,
    })
  })

  it('sets binPath with plain value', () => {
    useLaunchStore.getState().setBinPath({ tool1: '/usr/local/bin/tool1' })
    expect(useLaunchStore.getState().binPath).toStrictEqual({
      tool1: '/usr/local/bin/tool1',
    })
  })

  it('sets binPath with updater function', () => {
    useLaunchStore.getState().setBinPath({ tool1: '/usr/local/bin/tool1' })
    useLaunchStore
      .getState()
      .setBinPath((prev) => ({ ...prev, tool2: undefined }))
    expect(useLaunchStore.getState().binPath).toStrictEqual({
      tool1: '/usr/local/bin/tool1',
      tool2: undefined,
    })
  })

  it('sets busy with plain value', () => {
    useLaunchStore.getState().setBusy({ process1: true })
    expect(useLaunchStore.getState().busy).toStrictEqual({ process1: true })
  })

  it('sets busy with updater function', () => {
    useLaunchStore.getState().setBusy({ process1: true })
    useLaunchStore.getState().setBusy((prev) => ({ ...prev, process2: false }))
    expect(useLaunchStore.getState().busy).toStrictEqual({
      process1: true,
      process2: false,
    })
  })

  it('sets spinning with plain value', () => {
    useLaunchStore.getState().setSpinning({ loader1: true })
    expect(useLaunchStore.getState().spinning).toStrictEqual({ loader1: true })
  })

  it('sets spinning with updater function', () => {
    useLaunchStore.getState().setSpinning({ loader1: true })
    useLaunchStore
      .getState()
      .setSpinning((prev) => ({ ...prev, loader2: false }))
    expect(useLaunchStore.getState().spinning).toStrictEqual({
      loader1: true,
      loader2: false,
    })
  })

  it('sets phase with plain value', () => {
    useLaunchStore.getState().setPhase({ install1: 'installing' })
    expect(useLaunchStore.getState().phase).toStrictEqual({
      install1: 'installing',
    })
  })

  it('sets phase with updater function', () => {
    useLaunchStore.getState().setPhase({ install1: 'installing' })
    useLaunchStore
      .getState()
      .setPhase((prev) => ({ ...prev, install2: 'configuring' }))
    expect(useLaunchStore.getState().phase).toStrictEqual({
      install1: 'installing',
      install2: 'configuring',
    })
  })

  it('sets logs with plain value', () => {
    useLaunchStore.getState().setLogs({ log1: ['line 1', 'line 2'] })
    expect(useLaunchStore.getState().logs).toStrictEqual({
      log1: ['line 1', 'line 2'],
    })
  })

  it('sets logs with updater function', () => {
    useLaunchStore.getState().setLogs({ log1: ['line 1'] })
    useLaunchStore
      .getState()
      .setLogs((prev) => ({ ...prev, log1: [...(prev.log1 ?? []), 'line 2'] }))
    expect(useLaunchStore.getState().logs).toStrictEqual({
      log1: ['line 1', 'line 2'],
    })
  })

  it('sets openLog with plain value', () => {
    useLaunchStore.getState().setOpenLog({ panel1: true })
    expect(useLaunchStore.getState().openLog).toStrictEqual({ panel1: true })
  })

  it('sets openLog with updater function', () => {
    useLaunchStore.getState().setOpenLog({ panel1: true })
    useLaunchStore
      .getState()
      .setOpenLog((prev) => ({ ...prev, panel2: false }))
    expect(useLaunchStore.getState().openLog).toStrictEqual({
      panel1: true,
      panel2: false,
    })
  })

  it('does not write to localStorage', () => {
    useLaunchStore.getState().setInstalled({ app1: true })
    expect(localStorage.length).toBe(0)
  })
})
