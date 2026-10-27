import { describe, it, expect } from 'vitest'
import {
  voiceErrorFromNative,
  voiceErrorMessageKey,
  isTerminalVoiceError,
  VOICE_ERROR_CODES,
} from '../errors'

describe('voiceErrorFromNative', () => {
  it('maps every native Rust AudioErrorCode to its camelCase code, and unknown/undefined/empty codes to internal', () => {
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

    // Unknown, undefined and empty codes fall back to 'internal'
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
