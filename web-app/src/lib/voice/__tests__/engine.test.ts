import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EngineManager } from '@janhq/core'
import {
  errorCodeOf,
  isVoiceModelInstalled,
  ensureVoiceEngine,
  keepVoiceEngineWarm,
  releaseVoiceEngine,
  VOICE_ENGINE_ERRORS,
} from '../engine'
import { VOICE_MODEL_ID } from '@/constants/voice'

const mocks = vi.hoisted(() => ({
  engine: null as any,
}))

vi.mock('@janhq/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@janhq/core')>()),
  EngineManager: {
    instance: () => ({ get: () => mocks.engine }),
  },
}))

describe('voice engine', () => {
  describe('errorCodeOf', () => {
    it('returns code from Error with code', () => {
      const err = new Error('test') as Error & { code?: string }
      err.code = 'SOME_CODE'
      expect(errorCodeOf(err)).toBe('SOME_CODE')
    })

    it('returns code from plain object with code', () => {
      expect(errorCodeOf({ code: 'OTHER_CODE' })).toBe('OTHER_CODE')
    })

    it('returns undefined for string', () => {
      expect(errorCodeOf('string error')).toBeUndefined()
    })

    it('returns undefined for null or undefined', () => {
      expect(errorCodeOf(null)).toBeUndefined()
      expect(errorCodeOf(undefined)).toBeUndefined()
    })

    it('returns undefined for object without code', () => {
      expect(errorCodeOf({ message: 'hello' })).toBeUndefined()
    })
  })

  describe('isVoiceModelInstalled', () => {
    beforeEach(() => {
      mocks.engine = null
    })

    it('returns false when engine is missing', async () => {
      const result = await isVoiceModelInstalled()
      expect(result).toBe(false)
    })

    it('returns true when model is installed', async () => {
      mocks.engine = {
        list: async () => [{ id: 'other' }, { id: VOICE_MODEL_ID }],
      }
      const result = await isVoiceModelInstalled()
      expect(result).toBe(true)
    })

    it('returns false when model is not in list', async () => {
      mocks.engine = {
        list: async () => [{ id: 'other' }],
      }
      const result = await isVoiceModelInstalled()
      expect(result).toBe(false)
    })

    it('returns false when list throws error', async () => {
      mocks.engine = {
        list: async () => {
          throw new Error('failed')
        },
      }
      const result = await isVoiceModelInstalled()
      expect(result).toBe(false)
    })
  })

  describe('ensureVoiceEngine', () => {
    beforeEach(() => {
      mocks.engine = null
    })

    it('rejects with unsupported when engine is missing', async () => {
      let caughtCode: string | undefined
      try {
        await ensureVoiceEngine()
      } catch (err) {
        caughtCode = errorCodeOf(err)
      }
      expect(caughtCode).toBe(VOICE_ENGINE_ERRORS.unsupported)
    })

    it('rejects with unsupported when ensureTranscriptionModel is not available', async () => {
      mocks.engine = {}
      let caughtCode: string | undefined
      try {
        await ensureVoiceEngine()
      } catch (err) {
        caughtCode = errorCodeOf(err)
      }
      expect(caughtCode).toBe(VOICE_ENGINE_ERRORS.unsupported)
    })

    it('returns VoiceEngineTarget when session loads (default keepChatModelLoaded)', async () => {
      let passedBypass: boolean | undefined
      mocks.engine = {
        ensureTranscriptionModel: async (bypass: boolean) => {
          passedBypass = bypass
          return {
            port: 8080,
            api_key: 'test-key',
            model_id: 'test-model',
          }
        },
      }
      const result = await ensureVoiceEngine()
      expect(result).toEqual({
        baseUrl: 'http://127.0.0.1:8080/v1',
        apiKey: 'test-key',
        model: 'test-model',
      })
      expect(passedBypass).toBe(true)
    })

    it('returns VoiceEngineTarget when session loads (explicit keepChatModelLoaded false)', async () => {
      let passedBypass: boolean | undefined
      mocks.engine = {
        ensureTranscriptionModel: async (bypass: boolean) => {
          passedBypass = bypass
          return {
            port: 8081,
            api_key: 'test-key2',
            model_id: 'test-model2',
          }
        },
      }
      const result = await ensureVoiceEngine({ keepChatModelLoaded: false })
      expect(result).toEqual({
        baseUrl: 'http://127.0.0.1:8081/v1',
        apiKey: 'test-key2',
        model: 'test-model2',
      })
      expect(passedBypass).toBe(false)
    })
  })

  describe('keepVoiceEngineWarm and releaseVoiceEngine', () => {
    beforeEach(() => {
      mocks.engine = null
    })

    it('touches timer when engine is available', () => {
      let warmed = false
      mocks.engine = {
        touchTranscriptionIdleTimer: () => {
          warmed = true
        },
      }
      keepVoiceEngineWarm()
      expect(warmed).toBe(true)
    })

    it('does not throw when touching timer but engine is missing', () => {
      let threw = false
      try {
        keepVoiceEngineWarm()
      } catch {
        threw = true
      }
      expect(threw).toBe(false)
    })

    it('releases model when engine is available', async () => {
      let released = false
      mocks.engine = {
        releaseTranscriptionModel: async () => {
          released = true
        },
      }
      await releaseVoiceEngine()
      expect(released).toBe(true)
    })

    it('does not throw when releasing model but engine is missing', async () => {
      let threw = false
      try {
        await releaseVoiceEngine()
      } catch {
        threw = true
      }
      expect(threw).toBe(false)
    })
  })
})
