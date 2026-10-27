import { describe, it, expect } from 'vitest'
import {
  voiceErrorFromNative,
  voiceErrorMessageKey,
  isTerminalVoiceError,
  VOICE_ERROR_CODES,
  VoiceErrorCode,
} from '../errors'

describe('voiceErrorFromNative', () => {
  it('every known code in VOICE_ERROR_CODES maps to itself, unknown/undefined/empty codes map to the documented fallback', () => {
    // If I map `code as string` it fails.

    // We map the underlying native string for each code to the code itself where applicable!
    // Since some map to 'internal', we explicitly cover the mappings from the source.
    expect(voiceErrorFromNative('PERMISSION_DENIED')).toBe('permission')
    expect(voiceErrorFromNative('NO_INPUT_DEVICE')).toBe('noDevice')
    expect(voiceErrorFromNative('DEVICE_UNAVAILABLE')).toBe('deviceBusy')
    expect(voiceErrorFromNative('DEVICE_DISCONNECTED')).toBe('deviceDisconnected')
    expect(voiceErrorFromNative('ALREADY_ACTIVE')).toBe('internal')
    expect(voiceErrorFromNative('SESSION_NOT_FOUND')).toBe('internal')
    expect(voiceErrorFromNative('SERVER_UNREACHABLE')).toBe('engineFailed')
    expect(voiceErrorFromNative('TRANSCRIPTION_FAILED')).toBe('transcriptionFailed')
    expect(voiceErrorFromNative('TRANSCRIPTION_UNSUPPORTED')).toBe('transcriptionUnsupported')
    expect(voiceErrorFromNative('TRANSCRIPTION_TIMEOUT')).toBe('transcriptionTimeout')
    expect(voiceErrorFromNative('INTERNAL')).toBe('internal')

    // Test unknown/undefined/empty
    expect(voiceErrorFromNative('UNKNOWN_CODE')).toBe('internal')
    expect(voiceErrorFromNative(undefined)).toBe('internal')
    expect(voiceErrorFromNative('')).toBe('internal')
  })
})

describe('voiceErrorMessageKey', () => {
  it('returns exact key for each code', () => {
    for (const code of VOICE_ERROR_CODES) {
      expect(voiceErrorMessageKey(code)).toBe(`common:voiceInput.errors.${code}`)
    }
  })
})

describe('isTerminalVoiceError', () => {
  it('returns exact true/false for each code by iterating VOICE_ERROR_CODES', () => {
    const expected = {
      permission: true,
      noDevice: true,
      deviceBusy: true,
      deviceDisconnected: true,
      modelMissing: true,
      engineFailed: true,
      transcriptionFailed: false,
      transcriptionUnsupported: true,
      transcriptionTimeout: false,
      internal: true,
    } as const

    for (const code of VOICE_ERROR_CODES) {
      expect(isTerminalVoiceError(code)).toBe(expected[code])
    }
  })
})
