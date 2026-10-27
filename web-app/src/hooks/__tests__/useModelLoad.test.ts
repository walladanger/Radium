import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useModelLoad } from '../useModelLoad'

const initialState = useModelLoad.getState()

describe('useModelLoad', () => {
  beforeEach(() => {
    useModelLoad.setState(initialState, true)
  })

  afterEach(() => {
    // nothing to restore for now, but keeping for good practice.
  })

  it('has correct initial state', () => {
    const { result } = renderHook(() => useModelLoad())
    expect(result.current.modelLoadError).toBeUndefined()
    expect(result.current.modelLoadErrorModelId).toBeUndefined()
    expect(result.current.onboardingActive).toBe(false)
  })

  it('can set a string modelLoadError with a modelId', () => {
    const { result } = renderHook(() => useModelLoad())

    act(() => {
      result.current.setModelLoadError('Load error', 'model-1')
    })

    expect(result.current.modelLoadError).toBe('Load error')
    expect(result.current.modelLoadErrorModelId).toBe('model-1')
  })

  it('can set an ErrorObject modelLoadError with a modelId', () => {
    const { result } = renderHook(() => useModelLoad())
    const errorObj = { message: 'Load error object', code: '500' }

    act(() => {
      result.current.setModelLoadError(errorObj, 'model-2')
    })

    expect(result.current.modelLoadError).toStrictEqual(errorObj)
    expect(result.current.modelLoadErrorModelId).toBe('model-2')
  })

  it('clearing the error clears modelLoadErrorModelId even if modelId is passed', () => {
    const { result } = renderHook(() => useModelLoad())

    // First set an error
    act(() => {
      result.current.setModelLoadError('Load error', 'model-1')
    })

    expect(result.current.modelLoadError).toBe('Load error')
    expect(result.current.modelLoadErrorModelId).toBe('model-1')

    // Then clear the error, passing a modelId
    act(() => {
      result.current.setModelLoadError(undefined, 'model-1')
    })

    expect(result.current.modelLoadError).toBeUndefined()
    expect(result.current.modelLoadErrorModelId).toBeUndefined()
  })

  it('can set onboardingActive', () => {
    const { result } = renderHook(() => useModelLoad())

    act(() => {
      result.current.setOnboardingActive(true)
    })

    expect(result.current.onboardingActive).toBe(true)

    act(() => {
      result.current.setOnboardingActive(false)
    })

    expect(result.current.onboardingActive).toBe(false)
  })
})
