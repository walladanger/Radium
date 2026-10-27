import { describe, it, expect } from 'vitest'
import { readBlastRadius, readChangeReview, readAgentReason } from '../blast-radius'

describe('blast-radius', () => {
  describe('readBlastRadius', () => {
    it('returns null for falsy or non-object inputs', () => {
      expect(readBlastRadius(null)).toBeNull()
      expect(readBlastRadius(undefined)).toBeNull()
      expect(readBlastRadius('string')).toBeNull()
      expect(readBlastRadius(123)).toBeNull()
      expect(readBlastRadius(true)).toBeNull()
    })

    it('returns null if blastRadius is missing or not an object', () => {
      expect(readBlastRadius({})).toBeNull()
      expect(readBlastRadius({ blastRadius: null })).toBeNull()
      expect(readBlastRadius({ blastRadius: 'not an object' })).toBeNull()
    })

    it('returns null if action is missing or empty', () => {
      const preview = {
        blastRadius: {
          risk: 'low',
          changes: 'some changes',
        },
      }
      expect(readBlastRadius(preview)).toBeNull()

      const preview2 = {
        blastRadius: {
          action: '',
          risk: 'low',
        },
      }
      expect(readBlastRadius(preview2)).toBeNull()
    })

    it('returns null if risk is missing or invalid', () => {
      const preview = {
        blastRadius: {
          action: 'do something',
        },
      }
      expect(readBlastRadius(preview)).toBeNull()

      const preview2 = {
        blastRadius: {
          action: 'do something',
          risk: 'extreme', // Invalid risk
        },
      }
      expect(readBlastRadius(preview2)).toBeNull()
    })

    it('parses a fully valid blast radius object', () => {
      const preview = {
        blastRadius: {
          action: 'delete all files',
          changes: 'rm -rf /',
          disruption: 'high downtime',
          affects: 'everything',
          undo: 'reinstall os',
          needsAdmin: true,
          needsReboot: true,
          risk: 'high',
        },
      }
      expect(readBlastRadius(preview)).toEqual({
        action: 'delete all files',
        changes: 'rm -rf /',
        disruption: 'high downtime',
        affects: 'everything',
        undo: 'reinstall os',
        needsAdmin: true,
        needsReboot: true,
        risk: 'high',
      })
    })

    it('handles missing/partial optional fields, defaulting text to "" and booleans to false', () => {
      const preview = {
        blastRadius: {
          action: 'create a file',
          risk: 'low',
          // missing changes, disruption, affects, undo, needsAdmin, needsReboot
        },
      }
      expect(readBlastRadius(preview)).toEqual({
        action: 'create a file',
        changes: '',
        disruption: '',
        affects: '',
        undo: '',
        needsAdmin: false,
        needsReboot: false,
        risk: 'low',
      })
    })

    it('handles wrong field types by falling back gracefully', () => {
      const preview = {
        blastRadius: {
          action: 'test',
          risk: 'medium',
          changes: 123, // not a string
          disruption: null, // not a string
          needsAdmin: 'true', // not a boolean true
          needsReboot: 1, // not a boolean true
        },
      }
      expect(readBlastRadius(preview)).toEqual({
        action: 'test',
        changes: '',
        disruption: '',
        affects: '',
        undo: '',
        needsAdmin: false,
        needsReboot: false,
        risk: 'medium',
      })
    })
  })

  describe('readChangeReview', () => {
    it('returns null for falsy or non-object inputs', () => {
      expect(readChangeReview(null)).toBeNull()
      expect(readChangeReview(undefined)).toBeNull()
      expect(readChangeReview('string')).toBeNull()
      expect(readChangeReview(123)).toBeNull()
    })

    it('returns null if review is missing or not an object', () => {
      expect(readChangeReview({})).toBeNull()
      expect(readChangeReview({ review: null })).toBeNull()
      expect(readChangeReview({ review: 'not an object' })).toBeNull()
    })

    it('returns null if verdict is missing or invalid', () => {
      const preview = {
        review: {
          reason: 'looks good',
        },
      }
      expect(readChangeReview(preview)).toBeNull()

      const preview2 = {
        review: {
          verdict: 'maybe', // invalid verdict
          reason: 'looks good',
        },
      }
      expect(readChangeReview(preview2)).toBeNull()
    })

    it('parses a fully valid review object', () => {
      const preview = {
        review: {
          verdict: 'agree',
          reason: 'LGTM',
        },
      }
      expect(readChangeReview(preview)).toEqual({
        verdict: 'agree',
        reason: 'LGTM',
      })
    })

    it('defaults reason to "" if missing or wrong type', () => {
      const preview = {
        review: {
          verdict: 'concern',
        },
      }
      expect(readChangeReview(preview)).toEqual({
        verdict: 'concern',
        reason: '',
      })

      const preview2 = {
        review: {
          verdict: 'disagree',
          reason: null, // wrong type
        },
      }
      expect(readChangeReview(preview2)).toEqual({
        verdict: 'disagree',
        reason: '',
      })
    })
  })

  describe('readAgentReason', () => {
    it('returns null for falsy or non-object inputs', () => {
      expect(readAgentReason(null)).toBeNull()
      expect(readAgentReason(undefined)).toBeNull()
      expect(readAgentReason('string')).toBeNull()
    })

    it('returns trimmed string for valid agentReason', () => {
      const preview = {
        agentReason: '  Because I said so.  ',
      }
      expect(readAgentReason(preview)).toEqual('Because I said so.')
    })

    it('returns null if agentReason is missing or not a string', () => {
      expect(readAgentReason({})).toBeNull()
      expect(readAgentReason({ agentReason: null })).toBeNull()
      expect(readAgentReason({ agentReason: 123 })).toBeNull()
    })

    it('returns null if agentReason is empty or only whitespace', () => {
      expect(readAgentReason({ agentReason: '' })).toBeNull()
      expect(readAgentReason({ agentReason: '   ' })).toBeNull()
    })
  })
})
