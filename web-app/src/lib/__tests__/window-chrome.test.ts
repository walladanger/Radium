import { describe, it, expect, vi, afterEach } from 'vitest'
import { hasCustomWindowChrome } from '../window-chrome'

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(),
}))

import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

describe('hasCustomWindowChrome', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('returns false when IS_TAURI is false', () => {
    vi.stubGlobal('IS_TAURI', false)
    vi.stubGlobal('IS_WINDOWS', true)

    expect(hasCustomWindowChrome()).toBe(false)
  })

  it('returns false when IS_WINDOWS is false', () => {
    vi.stubGlobal('IS_TAURI', true)
    vi.stubGlobal('IS_WINDOWS', false)

    expect(hasCustomWindowChrome()).toBe(false)
  })

  it('returns true when window label is main and on Windows/Tauri', () => {
    vi.stubGlobal('IS_TAURI', true)
    vi.stubGlobal('IS_WINDOWS', true)

    vi.mocked(getCurrentWebviewWindow).mockReturnValue({ label: 'main' } as any)

    expect(hasCustomWindowChrome()).toBe(true)
  })

  it('returns false when window label is not main', () => {
    vi.stubGlobal('IS_TAURI', true)
    vi.stubGlobal('IS_WINDOWS', true)

    vi.mocked(getCurrentWebviewWindow).mockReturnValue({ label: 'settings' } as any)

    expect(hasCustomWindowChrome()).toBe(false)
  })

  it('returns false when getCurrentWebviewWindow throws', () => {
    vi.stubGlobal('IS_TAURI', true)
    vi.stubGlobal('IS_WINDOWS', true)

    vi.mocked(getCurrentWebviewWindow).mockImplementation(() => {
      throw new Error('Tauri error')
    })

    expect(hasCustomWindowChrome()).toBe(false)
  })
})
