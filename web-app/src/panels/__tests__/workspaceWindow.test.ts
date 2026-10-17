import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openPanelWorkspace } from '../openWorkspace'

const native = vi.hoisted(() => ({
  existing: null as null | { show: () => Promise<void>; unminimize: () => Promise<void>; setFocus: () => Promise<void> },
  windows: [] as { label: string; options: Record<string, unknown> }[],
  fail: false,
}))
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: class {
    static getByLabel = async () => native.existing
    constructor(label: string, options: Record<string, unknown>) { native.windows.push({ label, options }) }
    once(event: string, callback: (value: { payload: unknown }) => void) {
      if (event === (native.fail ? 'tauri:error' : 'tauri:created')) {
        queueMicrotask(() => callback({ payload: 'creation failed' }))
      }
      return Promise.resolve(() => {})
    }
  },
}))
beforeEach(() => { native.existing = null; native.windows.length = 0; native.fail = false })
describe('panel workspace window', () => {
  it('coalesces concurrent opens and uses the isolated workspace entry', async () => {
    await Promise.all([openPanelWorkspace(), openPanelWorkspace()])
    expect(native.windows).toHaveLength(1)
    expect(native.windows[0]).toMatchObject({
      label: 'radium-workspace',
      options: { url: '/workspace.html', title: 'Radium Workspace', resizable: true },
    })
  })
  it('restores and focuses an existing window without creating a duplicate', async () => {
    const effects: string[] = []
    native.existing = {
      show: async () => { effects.push('show') },
      unminimize: async () => { effects.push('restore') },
      setFocus: async () => { effects.push('focus') },
    }
    await openPanelWorkspace()
    expect(effects).toEqual(['show', 'restore', 'focus'])
    expect(native.windows).toHaveLength(0)
  })
  it('reports failed creation and permits a fresh attempt', async () => {
    native.fail = true
    await expect(openPanelWorkspace()).rejects.toThrow(/creation failed/)
    native.fail = false
    await openPanelWorkspace()
    expect(native.windows).toHaveLength(2)
  })
})
