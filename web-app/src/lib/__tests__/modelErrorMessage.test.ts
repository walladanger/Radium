import { describe, expect, it } from 'vitest'
import { extractModelErrorMessage } from '../modelErrorMessage'

describe('extractModelErrorMessage', () => {
  it('returns message from Error instance', () => {
    const error = new Error('Test error message')
    expect(extractModelErrorMessage(error)).toBe('Test error message')
  })

  it('returns message from plain object with non-empty message', () => {
    expect(extractModelErrorMessage({ message: 'Object error message' })).toBe(
      'Object error message'
    )
  })

  it('returns "Unknown error" for object with blank/whitespace message or non-string message', () => {
    expect(extractModelErrorMessage({ message: '' })).toBe('Unknown error')
    expect(extractModelErrorMessage({ message: '   ' })).toBe('Unknown error')
    expect(extractModelErrorMessage({ message: null })).toBe('Unknown error')
    expect(extractModelErrorMessage({ message: 123 })).toBe('Unknown error')
    expect(extractModelErrorMessage({})).toBe('Unknown error')
  })

  it('returns string as-is', () => {
    expect(extractModelErrorMessage('String error message')).toBe(
      'String error message'
    )
  })

  it('returns "Unknown error" for null, undefined, or number', () => {
    expect(extractModelErrorMessage(null)).toBe('Unknown error')
    expect(extractModelErrorMessage(undefined)).toBe('Unknown error')
    expect(extractModelErrorMessage(404)).toBe('Unknown error')
  })
})
