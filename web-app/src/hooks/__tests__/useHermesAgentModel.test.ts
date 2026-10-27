import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useHermesAgentModel } from '../useHermesAgentModel'

const STORAGE_KEY = 'hermes-agent-model'
const { mockConsoleWarn } = vi.hoisted(() => {
  return { mockConsoleWarn: vi.fn() }
})

describe('useHermesAgentModel', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubGlobal('console', { ...console, warn: mockConsoleWarn })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('should initialize with default config when localStorage is empty', () => {
    const { result } = renderHook(() => useHermesAgentModel())
    expect(result.current.config).toStrictEqual({ model: null })
  })

  it('should initialize with parsed config when localStorage has valid data', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ model: 'llama3' }))
    const { result } = renderHook(() => useHermesAgentModel())
    expect(result.current.config).toStrictEqual({ model: 'llama3' })
  })

  it('should initialize with parsed config parsing undefined model to null', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ model: undefined }))
    const { result } = renderHook(() => useHermesAgentModel())
    expect(result.current.config).toStrictEqual({ model: null })
  })

  it('should initialize with default config and warn when localStorage data is invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid-json')
    const { result } = renderHook(() => useHermesAgentModel())
    expect(result.current.config).toStrictEqual({ model: null })
    expect(mockConsoleWarn).toHaveBeenCalledWith('Failed to load hermes-agent config from localStorage')
  })

  it('should initialize with default config when localStorage data is null object', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(null))
    const { result } = renderHook(() => useHermesAgentModel())
    expect(result.current.config).toStrictEqual({ model: null })
  })

  it('should initialize with default config when localStorage data is an array', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['model']))
    const { result } = renderHook(() => useHermesAgentModel())
    expect(result.current.config).toStrictEqual({ model: null })
  })

  it('should initialize with default config when localStorage data is not an object', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify('string-data'))
    const { result } = renderHook(() => useHermesAgentModel())
    expect(result.current.config).toStrictEqual({ model: null })
  })

  it('should initialize with default config when localStorage data is missing model key', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ otherKey: 'llama3' }))
    const { result } = renderHook(() => useHermesAgentModel())
    expect(result.current.config).toStrictEqual({ model: null })
  })

  it('should update model and save to localStorage when setModel is called', () => {
    const { result } = renderHook(() => useHermesAgentModel())

    act(() => {
      result.current.setModel('gpt-4')
    })

    expect(result.current.config).toStrictEqual({ model: 'gpt-4' })
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify({ model: 'gpt-4' }))
  })

  it('should update config and warn when setModel is called and saveToStorage throws', () => {
    const { result } = renderHook(() => useHermesAgentModel())

    const setItemSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded')
    })

    act(() => {
      result.current.setModel('gpt-4')
    })

    expect(result.current.config).toStrictEqual({ model: 'gpt-4' })
    expect(mockConsoleWarn).toHaveBeenCalledWith('Failed to save hermes-agent config to localStorage')

    setItemSpy.mockRestore()
  })

  it('should clear model and update localStorage when clearModel is called', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ model: 'llama3' }))
    const { result } = renderHook(() => useHermesAgentModel())

    act(() => {
      result.current.clearModel()
    })

    expect(result.current.config).toStrictEqual({ model: null })
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify({ model: null }))
  })
})
