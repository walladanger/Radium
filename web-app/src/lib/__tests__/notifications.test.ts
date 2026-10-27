import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { tauriInvokeMock, permissionMock } = vi.hoisted(() => {
  return {
    tauriInvokeMock: {
      calls: [] as { cmd: string; args: any }[],
      errorToThrow: null as Error | null,
    },
    permissionMock: {
      isGranted: false,
      requestResult: 'default' as 'granted' | 'denied' | 'default',
      isGrantedError: null as Error | null,
      requestError: null as Error | null,
      isGrantedCalls: 0,
      requestCalls: 0,
    },
  }
})

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args: any) => {
    tauriInvokeMock.calls.push({ cmd, args })
    if (tauriInvokeMock.errorToThrow) {
      throw tauriInvokeMock.errorToThrow
    }
  },
}))

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: async () => {
    permissionMock.isGrantedCalls++
    if (permissionMock.isGrantedError) throw permissionMock.isGrantedError
    return permissionMock.isGranted
  },
  requestPermission: async () => {
    permissionMock.requestCalls++
    if (permissionMock.requestError) throw permissionMock.requestError
    return permissionMock.requestResult
  },
}))

describe('notifyThreadCompleted', () => {
  let notifyThreadCompleted: typeof import('../notifications').notifyThreadCompleted
  let logs: { type: string; args: any[] }[] = []

  beforeEach(async () => {
    vi.resetModules()
    tauriInvokeMock.calls = []
    tauriInvokeMock.errorToThrow = null
    permissionMock.isGranted = false
    permissionMock.requestResult = 'default'
    permissionMock.isGrantedError = null
    permissionMock.requestError = null
    permissionMock.isGrantedCalls = 0
    permissionMock.requestCalls = 0

    logs = []
    vi.stubGlobal('console', {
      ...console,
      info: (...args: any[]) => logs.push({ type: 'info', args }),
      warn: (...args: any[]) => logs.push({ type: 'warn', args }),
      error: (...args: any[]) => logs.push({ type: 'error', args }),
    })

    const mod = await import('../notifications')
    notifyThreadCompleted = mod.notifyThreadCompleted
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns early when not running in Tauri', async () => {
    vi.stubGlobal('IS_TAURI', false)
    await notifyThreadCompleted('Thread 1', 'Completed successfully')

    expect(tauriInvokeMock.calls).toEqual([])
    expect(permissionMock.isGrantedCalls).toBe(0)

    const warnLogs = logs.filter(l => l.type === 'warn').map(l => l.args[0])
    expect(warnLogs).toContain('[notifications] skipped: not a Tauri runtime')
  })

  it('invokes desktop notification when permission is already granted', async () => {
    vi.stubGlobal('IS_TAURI', true)
    permissionMock.isGranted = true

    await notifyThreadCompleted('Thread 2', 'Done!')

    expect(permissionMock.isGrantedCalls).toBe(1)
    expect(permissionMock.requestCalls).toBe(0)
    expect(tauriInvokeMock.calls).toEqual([
      { cmd: 'show_desktop_notification', args: { title: 'Thread 2', body: 'Done!' } }
    ])
  })

  it('requests permission and invokes notification if granted', async () => {
    vi.stubGlobal('IS_TAURI', true)
    permissionMock.isGranted = false
    permissionMock.requestResult = 'granted'

    await notifyThreadCompleted('Thread 3', 'Finished!')

    expect(permissionMock.isGrantedCalls).toBe(1)
    expect(permissionMock.requestCalls).toBe(1)
    expect(tauriInvokeMock.calls).toEqual([
      { cmd: 'show_desktop_notification', args: { title: 'Thread 3', body: 'Finished!' } }
    ])
  })

  it('does not invoke notification if permission is denied upon request', async () => {
    vi.stubGlobal('IS_TAURI', true)
    permissionMock.isGranted = false
    permissionMock.requestResult = 'denied'

    await notifyThreadCompleted('Thread 4', 'Aborted')

    expect(permissionMock.isGrantedCalls).toBe(1)
    expect(permissionMock.requestCalls).toBe(1)
    expect(tauriInvokeMock.calls).toEqual([])

    const warnLogs = logs.filter(l => l.type === 'warn').map(l => l.args[0])
    expect(warnLogs).toContain('[notifications] skipped: OS permission not granted')
  })

  it('handles errors during permission check gracefully', async () => {
    vi.stubGlobal('IS_TAURI', true)
    const err = new Error('D-Bus failed')
    permissionMock.isGrantedError = err

    await notifyThreadCompleted('Thread 5', 'Crash')

    expect(tauriInvokeMock.calls).toEqual([])

    const errorLogs = logs.filter(l => l.type === 'error').map(l => l.args)
    expect(errorLogs).toEqual([
      ['[notifications] permission flow failed', err]
    ])
  })

  it('handles errors when invoking the notification command', async () => {
    vi.stubGlobal('IS_TAURI', true)
    permissionMock.isGranted = true
    const err = new Error('Spawn blocking failed')
    tauriInvokeMock.errorToThrow = err

    await notifyThreadCompleted('Thread 6', 'Crash 2')

    expect(tauriInvokeMock.calls).toEqual([
      { cmd: 'show_desktop_notification', args: { title: 'Thread 6', body: 'Crash 2' } }
    ])

    const errorLogs = logs.filter(l => l.type === 'error').map(l => l.args)
    expect(errorLogs).toEqual([
      ['[notifications] show_desktop_notification failed', err]
    ])
  })

  it('caches the granted permission promise and only checks once', async () => {
    vi.stubGlobal('IS_TAURI', true)
    permissionMock.isGranted = true

    await notifyThreadCompleted('First', 'Call')
    await notifyThreadCompleted('Second', 'Call')

    expect(permissionMock.isGrantedCalls).toBe(1)
    expect(tauriInvokeMock.calls).toEqual([
      { cmd: 'show_desktop_notification', args: { title: 'First', body: 'Call' } },
      { cmd: 'show_desktop_notification', args: { title: 'Second', body: 'Call' } }
    ])
  })

  it('does not cache the permission promise if permission is denied', async () => {
    vi.stubGlobal('IS_TAURI', true)
    permissionMock.isGranted = false
    permissionMock.requestResult = 'denied'

    await notifyThreadCompleted('First', 'Deny')

    expect(permissionMock.isGrantedCalls).toBe(1)
    expect(permissionMock.requestCalls).toBe(1)

    permissionMock.requestResult = 'granted'
    await notifyThreadCompleted('Second', 'Allow')

    expect(permissionMock.isGrantedCalls).toBe(2)
    expect(permissionMock.requestCalls).toBe(2)
    expect(tauriInvokeMock.calls).toEqual([
      { cmd: 'show_desktop_notification', args: { title: 'Second', body: 'Allow' } }
    ])
  })
})
