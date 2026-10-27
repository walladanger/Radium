import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getModelContextLength } from '../apiServerCapacity'

const mockProvidersState = vi.hoisted(() => ({
  providers: [] as any[],
}))

vi.mock('@/hooks/useModelProvider', () => ({
  useModelProvider: {
    getState: () => mockProvidersState,
  },
}))

describe('apiServerCapacity', () => {
  beforeEach(() => {
    mockProvidersState.providers = []
  })

  describe('getModelContextLength', () => {
    it('returns undefined when modelId is missing', () => {
      expect(getModelContextLength(undefined)).toBeUndefined()
      expect(getModelContextLength(null)).toBeUndefined()
      expect(getModelContextLength('')).toBeUndefined()
    })

    it('returns undefined when providers array is empty', () => {
      expect(getModelContextLength('model-1')).toBeUndefined()
    })

    it('returns undefined when model is not found', () => {
      mockProvidersState.providers = [
        { models: [{ id: 'model-2' }] },
      ]
      expect(getModelContextLength('model-1')).toBeUndefined()
    })

    it('returns undefined when model has no settings', () => {
      mockProvidersState.providers = [
        { models: [{ id: 'model-1' }] },
      ]
      expect(getModelContextLength('model-1')).toBeUndefined()
    })

    it('returns undefined when ctx_len is missing', () => {
      mockProvidersState.providers = [
        { models: [{ id: 'model-1', settings: {} }] },
      ]
      expect(getModelContextLength('model-1')).toBeUndefined()
    })

    it('returns undefined when controller_props is missing', () => {
      mockProvidersState.providers = [
        { models: [{ id: 'model-1', settings: { ctx_len: {} } }] },
      ]
      expect(getModelContextLength('model-1')).toBeUndefined()
    })

    it('returns undefined when value is not a number', () => {
      mockProvidersState.providers = [
        { models: [{ id: 'model-1', settings: { ctx_len: { controller_props: { value: '1024' } } } }] },
      ]
      expect(getModelContextLength('model-1')).toBeUndefined()
    })

    it('returns undefined when value is <= 0', () => {
      mockProvidersState.providers = [
        { models: [{ id: 'model-1', settings: { ctx_len: { controller_props: { value: 0 } } } }] },
      ]
      expect(getModelContextLength('model-1')).toBeUndefined()

      mockProvidersState.providers = [
        { models: [{ id: 'model-1', settings: { ctx_len: { controller_props: { value: -1024 } } } }] },
      ]
      expect(getModelContextLength('model-1')).toBeUndefined()
    })

    it('returns the context length when value is a positive number', () => {
      mockProvidersState.providers = [
        { models: [{ id: 'model-1', settings: { ctx_len: { controller_props: { value: 2048 } } } }] },
      ]
      expect(getModelContextLength('model-1')).toBe(2048)
    })

    it('returns the context length from the correct provider', () => {
      mockProvidersState.providers = [
        { models: [{ id: 'model-2', settings: { ctx_len: { controller_props: { value: 1024 } } } }] },
        null, // testing optional chaining fallback
        { models: [{ id: 'model-1', settings: { ctx_len: { controller_props: { value: 4096 } } } }] },
      ]
      expect(getModelContextLength('model-1')).toBe(4096)
    })
  })
})
