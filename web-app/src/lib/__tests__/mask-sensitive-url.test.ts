import { describe, expect, it } from 'vitest'
import { maskSensitiveUrl } from '../mask-sensitive-url'

describe('maskSensitiveUrl', () => {
  it('returns empty string as-is', () => {
    expect(maskSensitiveUrl('')).toBe('')
  })

  it('leaves URL without query unchanged', () => {
    expect(maskSensitiveUrl('https://example.com/api/v1/models')).toBe(
      'https://example.com/api/v1/models'
    )
  })

  it('masks sensitive parameters', () => {
    expect(
      maskSensitiveUrl('https://example.com/models?api_key=abc&model=x')
    ).toBe('https://example.com/models?api_key=******&model=x')
  })

  it('matches parameters case-insensitively', () => {
    expect(
      maskSensitiveUrl('https://example.com/models?API_KEY=abc&Token=def')
    ).toBe('https://example.com/models?API_KEY=******&Token=******')
  })

  it('masks multiple sensitive parameters at once', () => {
    expect(
      maskSensitiveUrl('https://example.com/auth?password=xyz&secret=123')
    ).toBe('https://example.com/auth?password=******&secret=******')
  })

  it('preserves non-sensitive parameters', () => {
    expect(
      maskSensitiveUrl('https://example.com/search?q=hello&page=1')
    ).toBe('https://example.com/search?q=hello&page=1')
  })

  it('masks unparsable input with a "?" by masking everything after it', () => {
    expect(maskSensitiveUrl('not a url?key=123&other=456')).toBe(
      'not a url?******'
    )
  })

  it('returns unparsable input without "?" unchanged', () => {
    expect(maskSensitiveUrl('not a url at all')).toBe('not a url at all')
  })
})
