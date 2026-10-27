import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('useVoiceSetting', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('should have correct default values', async () => {
    const { useVoiceSetting } = await import('../useVoiceSetting')
    const { result } = renderHook(() => useVoiceSetting())

    expect(result.current.setupCompleted).toBe(false)
    expect(result.current.inputDeviceId).toBe(null)
    expect(result.current.languageHint).toBe('auto')
    expect(result.current.liveTranscription).toBe(true)
    expect(result.current.micPermissionAsked).toBe(false)
    expect(result.current.unloadChatModelWhileDictating).toBe(false)
  })

  it('should update state and persist to localStorage', async () => {
    const { useVoiceSetting } = await import('../useVoiceSetting')
    const { result } = renderHook(() => useVoiceSetting())

    act(() => {
      result.current.setSetupCompleted(true)
      result.current.setInputDeviceId('device-123')
      result.current.setLanguageHint('en')
      result.current.setLiveTranscription(false)
      result.current.setMicPermissionAsked(true)
      result.current.setUnloadChatModelWhileDictating(true)
    })

    expect(result.current.setupCompleted).toBe(true)
    expect(result.current.inputDeviceId).toBe('device-123')
    expect(result.current.languageHint).toBe('en')
    expect(result.current.liveTranscription).toBe(false)
    expect(result.current.micPermissionAsked).toBe(true)
    expect(result.current.unloadChatModelWhileDictating).toBe(true)

    const stored = JSON.parse(localStorage.getItem('setting-voice') || '{}')
    expect(stored.version).toBe(2)
    expect(stored.state).toStrictEqual({
      setupCompleted: true,
      inputDeviceId: 'device-123',
      languageHint: 'en',
      liveTranscription: false,
      micPermissionAsked: true,
      unloadChatModelWhileDictating: true,
    })
  })

  describe('migration', () => {
    it('should migrate invalid languageHint to auto', async () => {
      localStorage.setItem(
        'setting-voice',
        JSON.stringify({
          state: { languageHint: 'fr', setupCompleted: true },
          version: 1,
        })
      )

      const { useVoiceSetting } = await import('../useVoiceSetting')
      const { result } = renderHook(() => useVoiceSetting())

      expect(result.current.languageHint).toBe('auto')
      expect(result.current.setupCompleted).toBe(true)
    })

    it('should keep valid languageHint', async () => {
      localStorage.setItem(
        'setting-voice',
        JSON.stringify({
          state: { languageHint: 'en' },
          version: 1,
        })
      )

      const { useVoiceSetting } = await import('../useVoiceSetting')
      const { result } = renderHook(() => useVoiceSetting())

      expect(result.current.languageHint).toBe('en')
    })
  })
})
