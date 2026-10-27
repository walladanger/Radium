import { describe, it, expect } from 'vitest'
import {
  paramsSettings,
  paramCategories,
  paramGroups,
  SAMPLING_PARAM_KEYS,
  GEMMA4_QAT_RECOMMENDED_SAMPLING,
  isGemma4Qat,
  withRecommendedSampling,
} from '../predefinedParams'

describe('predefinedParams data invariants', () => {
  it('every key in paramGroups exists in paramsSettings and has the matching category', () => {
    for (const [groupId, keys] of Object.entries(paramGroups)) {
      for (const key of keys) {
        expect(paramsSettings[key]).toBeDefined()
        expect(paramsSettings[key]?.category).toBe(groupId)
      }
    }
  })

  it('every paramsSettings entry belongs to exactly one group', () => {
    const allGroupedKeys = Object.values(paramGroups).flat()
    const allSettingsKeys = Object.keys(paramsSettings)

    // Check sizes and elements exactly to avoid tautology and ensure concrete assertions
    expect(allGroupedKeys.sort()).toStrictEqual(allSettingsKeys.sort())
  })

  it('paramCategories ids match the keys of paramGroups', () => {
    const categoryIds = paramCategories.map((c) => c.id).sort()
    const groupKeys = Object.keys(paramGroups).sort()

    expect(categoryIds).toStrictEqual(groupKeys)
    // Concrete assertion for the exact categories
    expect(categoryIds).toStrictEqual(['general', 'penalties', 'sampling'])
  })

  it('SAMPLING_PARAM_KEYS equals exactly the flattened keys of the sampling-related categories', () => {
    const computedFlattenedKeys = paramCategories.flatMap(
      (category) => paramGroups[category.id]
    )
    expect(SAMPLING_PARAM_KEYS).toStrictEqual(computedFlattenedKeys)

    // Concrete assertion for the exact SAMPLING_PARAM_KEYS
    expect(SAMPLING_PARAM_KEYS).toStrictEqual([
      'temperature',
      'top_p',
      'top_k',
      'min_p',
      'frequency_penalty',
      'presence_penalty',
      'repeat_penalty',
      'stream',
    ])
  })

  it('slider settings have min <= default value <= max, with step > 0 where present', () => {
    for (const setting of Object.values(paramsSettings)) {
      if (setting.controllerType === 'slider') {
        const value = setting.value as number
        expect(typeof value).toBe('number')
        expect(setting.min).toBeDefined()
        expect(setting.max).toBeDefined()

        const min = setting.min as number
        const max = setting.max as number

        expect(value).toBeGreaterThanOrEqual(min)
        expect(value).toBeLessThanOrEqual(max)
        expect(min).toBeLessThan(max)

        if (setting.step !== undefined) {
          expect(setting.step).toBeGreaterThan(0)
        }
      }
    }
  })

  it('every GEMMA4_QAT_RECOMMENDED_SAMPLING key is a known param with a value within that params min/max limits', () => {
    const qatKeys = Object.keys(GEMMA4_QAT_RECOMMENDED_SAMPLING)

    expect(qatKeys.length).toBe(3)
    expect(qatKeys.sort()).toStrictEqual(['temperature', 'top_k', 'top_p'])

    for (const [key, value] of Object.entries(
      GEMMA4_QAT_RECOMMENDED_SAMPLING
    )) {
      const setting = paramsSettings[key]
      expect(setting).toBeDefined()
      expect(setting?.controllerType).toBe('slider')

      const min = setting?.min as number
      const max = setting?.max as number

      expect(value).toBeGreaterThanOrEqual(min)
      expect(value).toBeLessThanOrEqual(max)
    }
  })

  describe('isGemma4Qat', () => {
    it('returns true for Gemma 4 QAT models correctly', () => {
      expect(isGemma4Qat('gemma-4-qat-model')).toBe(true)
      expect(isGemma4Qat('gemma4-qat')).toBe(true)
      expect(isGemma4Qat('model-gemma_4-qat')).toBe(true)
    })

    it('returns false for non-QAT or non-Gemma 4 models', () => {
      expect(isGemma4Qat('gemma-4-model')).toBe(false)
      expect(isGemma4Qat('gemma-3-qat-model')).toBe(false)
      expect(isGemma4Qat('other-model')).toBe(false)
      expect(isGemma4Qat('gemma4qat')).toBe(false) // Boundary check on qat
      expect(isGemma4Qat('gemma-4-iqat')).toBe(false) // Boundary check on qat
    })
  })

  describe('withRecommendedSampling', () => {
    it('layers recommended sampling over given params for Gemma 4 QAT models when not user overridden', () => {
      const initialParams = {
        temperature: 0.5,
        top_p: 0.8,
        other_param: 'value',
      }
      const result = withRecommendedSampling(
        'gemma-4-qat',
        initialParams,
        false
      )

      expect(result).toStrictEqual({
        temperature: 1.0,
        top_p: 0.95,
        top_k: 64,
        other_param: 'value',
      })
    })

    it('returns input unchanged if user has overridden sampling', () => {
      const initialParams = {
        temperature: 0.5,
        top_p: 0.8,
        other_param: 'value',
      }
      const result = withRecommendedSampling('gemma-4-qat', initialParams, true)

      expect(result).toStrictEqual(initialParams)
    })

    it('returns input unchanged if model is not Gemma 4 QAT', () => {
      const initialParams = {
        temperature: 0.5,
        top_p: 0.8,
        other_param: 'value',
      }
      const result = withRecommendedSampling('gemma-4', initialParams, false)

      expect(result).toStrictEqual(initialParams)
    })

    it('returns input unchanged if modelId is undefined', () => {
      const initialParams = {
        temperature: 0.5,
        top_p: 0.8,
        other_param: 'value',
      }
      const result = withRecommendedSampling(undefined, initialParams, false)

      expect(result).toStrictEqual(initialParams)
    })
  })
})
