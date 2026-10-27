import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PlatformFeature } from '../types'

const mockFlags = vi.hoisted(() => ({
  tauri: false,
  ios: false,
  android: false,
  calls: 0,
}))

vi.mock('../utils', () => ({
  isPlatformTauri: vi.fn(() => {
    mockFlags.calls++
    return mockFlags.tauri
  }),
  isPlatformIOS: vi.fn(() => {
    mockFlags.calls++
    return mockFlags.ios
  }),
  isPlatformAndroid: vi.fn(() => {
    mockFlags.calls++
    return mockFlags.android
  }),
}))

describe('PlatformFeatures const', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFlags.tauri = false
    mockFlags.ios = false
    mockFlags.android = false
    mockFlags.calls = 0
  })

  it('contains exactly the keys defined in PlatformFeature', async () => {
    const { PlatformFeatures } = await import('../const')
    expect(Object.keys(PlatformFeatures).sort()).toEqual(
      Object.values(PlatformFeature).sort()
    )
  })

  it('evaluates properties lazily and reads flags upon property access', async () => {
    const { PlatformFeatures } = await import('../const')
    expect(mockFlags.calls).toBe(0)

    mockFlags.tauri = true
    const result1 = PlatformFeatures[PlatformFeature.LOCAL_INFERENCE]
    expect(result1).toBe(true)
    expect(mockFlags.calls).toBeGreaterThan(0)

    const callsAfterFirst = mockFlags.calls
    mockFlags.tauri = false
    const result2 = PlatformFeatures[PlatformFeature.LOCAL_INFERENCE]
    expect(result2).toBe(false)
    expect(mockFlags.calls).toBeGreaterThan(callsAfterFirst)
  })

  it('evaluates accurately for Desktop Tauri', async () => {
    mockFlags.tauri = true
    mockFlags.ios = false
    mockFlags.android = false

    const { PlatformFeatures } = await import('../const')

    expect(PlatformFeatures[PlatformFeature.HARDWARE_MONITORING]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.LOCAL_INFERENCE]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.LOCAL_API_SERVER]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.MODEL_HUB]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.SYSTEM_INTEGRATIONS]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.HTTPS_PROXY]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.DEFAULT_PROVIDERS]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.PROJECTS]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.ANALYTICS]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.WEB_AUTO_MODEL_SELECTION]).toBe(
      false
    )
    expect(PlatformFeatures[PlatformFeature.MODEL_PROVIDER_SETTINGS]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.MCP_AUTO_APPROVE_TOOLS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.MCP_SERVERS_SETTINGS]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.EXTENSIONS_SETTINGS]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.ASSISTANTS]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.SHORTCUT]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.FILE_ATTACHMENTS]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.VOICE_INPUT]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.CHATGPT_SUBSCRIPTION]).toBe(true)
  })

  it('evaluates accurately for iOS shell', async () => {
    mockFlags.tauri = true
    mockFlags.ios = true
    mockFlags.android = false

    const { PlatformFeatures } = await import('../const')

    expect(PlatformFeatures[PlatformFeature.HARDWARE_MONITORING]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.LOCAL_INFERENCE]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.LOCAL_API_SERVER]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.MODEL_HUB]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.SYSTEM_INTEGRATIONS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.HTTPS_PROXY]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.DEFAULT_PROVIDERS]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.PROJECTS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.ANALYTICS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.WEB_AUTO_MODEL_SELECTION]).toBe(
      false
    )
    expect(PlatformFeatures[PlatformFeature.MODEL_PROVIDER_SETTINGS]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.MCP_AUTO_APPROVE_TOOLS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.MCP_SERVERS_SETTINGS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.EXTENSIONS_SETTINGS]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.ASSISTANTS]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.SHORTCUT]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.FILE_ATTACHMENTS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.VOICE_INPUT]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.CHATGPT_SUBSCRIPTION]).toBe(false)
  })

  it('evaluates accurately for Android shell', async () => {
    mockFlags.tauri = true
    mockFlags.ios = false
    mockFlags.android = true

    const { PlatformFeatures } = await import('../const')

    expect(PlatformFeatures[PlatformFeature.HARDWARE_MONITORING]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.LOCAL_INFERENCE]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.LOCAL_API_SERVER]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.MODEL_HUB]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.SYSTEM_INTEGRATIONS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.HTTPS_PROXY]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.DEFAULT_PROVIDERS]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.PROJECTS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.ANALYTICS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.WEB_AUTO_MODEL_SELECTION]).toBe(
      false
    )
    expect(PlatformFeatures[PlatformFeature.MODEL_PROVIDER_SETTINGS]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.MCP_AUTO_APPROVE_TOOLS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.MCP_SERVERS_SETTINGS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.EXTENSIONS_SETTINGS]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.ASSISTANTS]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.SHORTCUT]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.FILE_ATTACHMENTS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.VOICE_INPUT]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.CHATGPT_SUBSCRIPTION]).toBe(false)
  })

  it('evaluates accurately for web', async () => {
    mockFlags.tauri = false
    mockFlags.ios = false
    mockFlags.android = false

    const { PlatformFeatures } = await import('../const')

    expect(PlatformFeatures[PlatformFeature.HARDWARE_MONITORING]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.LOCAL_INFERENCE]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.LOCAL_API_SERVER]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.MODEL_HUB]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.SYSTEM_INTEGRATIONS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.HTTPS_PROXY]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.DEFAULT_PROVIDERS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.PROJECTS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.ANALYTICS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.WEB_AUTO_MODEL_SELECTION]).toBe(
      true
    )
    expect(PlatformFeatures[PlatformFeature.MODEL_PROVIDER_SETTINGS]).toBe(
      false
    )
    expect(PlatformFeatures[PlatformFeature.MCP_AUTO_APPROVE_TOOLS]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.MCP_SERVERS_SETTINGS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.EXTENSIONS_SETTINGS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.ASSISTANTS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.SHORTCUT]).toBe(true)
    expect(PlatformFeatures[PlatformFeature.FILE_ATTACHMENTS]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.VOICE_INPUT]).toBe(false)
    expect(PlatformFeatures[PlatformFeature.CHATGPT_SUBSCRIPTION]).toBe(false)
  })
})
