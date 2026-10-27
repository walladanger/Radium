import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useClaudeCodeModel } from '../useClaudeCodeModel'

const mocks = vi.hoisted(() => ({
  getItem: vi.fn(() => null as string | null),
  setItem: vi.fn(),
}))

describe('useClaudeCodeModel', () => {
  const STORAGE_KEY = 'claude-code-helper-models'

  const defaultModels = {
    big: null,
    medium: null,
    small: null,
    envVars: [],
    customCli: '',
  }

  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: mocks.getItem,
      setItem: mocks.setItem,
      clear: vi.fn(),
      removeItem: vi.fn(),
    })

    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    mocks.getItem.mockReset()
    mocks.setItem.mockReset()
  })

  it('loads default models if localStorage has no valid data', () => {
    mocks.getItem.mockReturnValueOnce(null)
    const { result } = renderHook(() => useClaudeCodeModel())
    expect(result.current.models).toStrictEqual(defaultModels)
    expect(mocks.getItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('loads valid models from localStorage', () => {
    const validData = {
      big: 'model-big-123',
      medium: 'model-medium-456',
      small: null,
      envVars: [{ key: 'API_KEY', value: 'secret' }],
      customCli: 'my-cli --help',
    }
    mocks.getItem.mockReturnValueOnce(JSON.stringify(validData))

    const { result } = renderHook(() => useClaudeCodeModel())

    expect(result.current.models).toStrictEqual(validData)
    expect(mocks.getItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('loads default models if parsed localStorage data is invalid (wrong structure)', () => {
    const invalidData = {
      big: 'model-big',
      // missing medium, small, envVars, customCli
    }
    mocks.getItem.mockReturnValueOnce(JSON.stringify(invalidData))

    const { result } = renderHook(() => useClaudeCodeModel())

    expect(result.current.models).toStrictEqual(defaultModels)
  })

  it('handles error if localStorage.getItem throws', () => {
    mocks.getItem.mockImplementationOnce(() => {
      throw new Error('getItem error')
    })

    const { result } = renderHook(() => useClaudeCodeModel())

    expect(result.current.models).toStrictEqual(defaultModels)
    expect(warnSpy).toHaveBeenCalledWith('Failed to load claude-code helper models from localStorage')
  })

  it('setModel updates the specific model type and saves to localStorage', () => {
    mocks.getItem.mockReturnValueOnce(null)
    const { result } = renderHook(() => useClaudeCodeModel())

    act(() => {
      result.current.setModel('big', 'new-big-model')
    })

    const expectedModels = { ...defaultModels, big: 'new-big-model' }
    expect(result.current.models).toStrictEqual(expectedModels)
    expect(mocks.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(expectedModels))
  })

  it('setEnvVars updates env vars and saves to localStorage', () => {
    mocks.getItem.mockReturnValueOnce(null)
    const { result } = renderHook(() => useClaudeCodeModel())

    const newEnvVars = [{ key: 'NEW_KEY', value: 'new_value' }]
    act(() => {
      result.current.setEnvVars(newEnvVars)
    })

    const expectedModels = { ...defaultModels, envVars: newEnvVars }
    expect(result.current.models).toStrictEqual(expectedModels)
    expect(mocks.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(expectedModels))
  })

  it('setCustomCli updates customCli and saves to localStorage', () => {
    mocks.getItem.mockReturnValueOnce(null)
    const { result } = renderHook(() => useClaudeCodeModel())

    act(() => {
      result.current.setCustomCli('custom-command')
    })

    const expectedModels = { ...defaultModels, customCli: 'custom-command' }
    expect(result.current.models).toStrictEqual(expectedModels)
    expect(mocks.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(expectedModels))
  })

  it('clearModels resets to default models and saves to localStorage', () => {
    const validData = {
      big: 'model-big-123',
      medium: 'model-medium-456',
      small: null,
      envVars: [{ key: 'API_KEY', value: 'secret' }],
      customCli: 'my-cli --help',
    }
    mocks.getItem.mockReturnValueOnce(JSON.stringify(validData))
    const { result } = renderHook(() => useClaudeCodeModel())

    expect(result.current.models).toStrictEqual(validData)

    act(() => {
      result.current.clearModels()
    })

    expect(result.current.models).toStrictEqual(defaultModels)
    expect(mocks.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(defaultModels))
  })

  it('handles error if localStorage.setItem throws during save', () => {
    mocks.getItem.mockReturnValueOnce(null)
    const { result } = renderHook(() => useClaudeCodeModel())

    mocks.setItem.mockImplementationOnce(() => {
      throw new Error('setItem error')
    })

    act(() => {
      result.current.setModel('small', 'small-model')
    })

    const expectedModels = { ...defaultModels, small: 'small-model' }
    expect(result.current.models).toStrictEqual(expectedModels)
    expect(warnSpy).toHaveBeenCalledWith('Failed to save claude-code helper models to localStorage')
  })
})
