import { describe, expect, it } from 'vitest'
import { FIT_PROVIDERS, readProviderFit } from '../provider-fit'

describe('readProviderFit', () => {
  it('returns null for null/undefined provider', () => {
    expect(readProviderFit(null)).toBeNull()
    expect(readProviderFit(undefined)).toBeNull()
  })

  it('returns null if provider is not in FIT_PROVIDERS', () => {
    expect(
      readProviderFit({
        provider: 'mlx',
        settings: [{ key: 'fit', controller_props: { value: true } }],
      })
    ).toBeNull()

    expect(
      readProviderFit({
        provider: 'openai',
        settings: [{ key: 'fit', controller_props: { value: 'true' } }],
      })
    ).toBeNull()
  })

  it('returns true/false when provider is in FIT_PROVIDERS and has boolean value', () => {
    expect(
      readProviderFit({
        provider: 'llamacpp',
        settings: [{ key: 'fit', controller_props: { value: true } }],
      })
    ).toBe(true)

    expect(
      readProviderFit({
        provider: 'llamacpp-upstream',
        settings: [{ key: 'fit', controller_props: { value: false } }],
      })
    ).toBe(false)
  })

  it('returns true/false when provider is in FIT_PROVIDERS and has string "true"/"false" value', () => {
    expect(
      readProviderFit({
        provider: 'llamacpp',
        settings: [{ key: 'fit', controller_props: { value: 'true' } }],
      })
    ).toBe(true)

    expect(
      readProviderFit({
        provider: 'llamacpp-upstream',
        settings: [{ key: 'fit', controller_props: { value: 'false' } }],
      })
    ).toBe(false)
  })

  it('returns null for missing fit setting or missing settings array', () => {
    expect(
      readProviderFit({
        provider: 'llamacpp',
        settings: [],
      })
    ).toBeNull()

    expect(
      readProviderFit({
        provider: 'llamacpp',
        settings: [{ key: 'other', controller_props: { value: true } }],
      })
    ).toBeNull()

    expect(
      readProviderFit({
        provider: 'llamacpp',
      })
    ).toBeNull()
  })

  it('returns null for other value types', () => {
    expect(
      readProviderFit({
        provider: 'llamacpp',
        settings: [{ key: 'fit', controller_props: { value: 1 } }],
      })
    ).toBeNull()

    expect(
      readProviderFit({
        provider: 'llamacpp',
        settings: [{ key: 'fit', controller_props: { value: 'yes' } }],
      })
    ).toBeNull()

    expect(
      readProviderFit({
        provider: 'llamacpp',
        settings: [{ key: 'fit', controller_props: { value: undefined } }],
      })
    ).toBeNull()
  })
})

describe('FIT_PROVIDERS', () => {
  it('contains expected providers', () => {
    expect(FIT_PROVIDERS.has('llamacpp')).toBe(true)
    expect(FIT_PROVIDERS.has('llamacpp-upstream')).toBe(true)
  })
})
