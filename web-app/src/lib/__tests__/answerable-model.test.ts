import { describe, expect, it } from 'vitest'
import { isAnswerableModel } from '../answerable-model'
import { EMBEDDING_MODEL_ID } from '@/constants/models'

describe('isAnswerableModel', () => {
  it('returns false for missing/empty id', () => {
    expect(isAnswerableModel({})).toBe(false)
    expect(isAnswerableModel({ id: '' })).toBe(false)
    expect(isAnswerableModel({ id: undefined })).toBe(false)
  })

  it('returns false if id is equal to EMBEDDING_MODEL_ID', () => {
    expect(isAnswerableModel({ id: EMBEDDING_MODEL_ID })).toBe(false)
  })

  it('returns false if missing is true', () => {
    expect(isAnswerableModel({ id: 'some-model', missing: true })).toBe(false)
  })

  it('returns true for a normal id', () => {
    expect(isAnswerableModel({ id: 'some-model' })).toBe(true)
    expect(isAnswerableModel({ id: 'some-model', missing: false })).toBe(true)
  })
})
