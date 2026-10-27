import { renderHook, act } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useFavoriteModel } from '../useFavoriteModel'
import { localStorageKey } from '@/constants/localStorage'
import type { Model } from '@/types/modelProviders'

describe('useFavoriteModel', () => {
  const mockModel1: Model = {
    id: 'model-1',
    name: 'Model 1',
  }

  const mockModel2: Model = {
    id: 'model-2',
    name: 'Model 2',
  }

  const initialState = useFavoriteModel.getState()

  beforeEach(() => {
    // Reset Zustand store state before each test
    useFavoriteModel.setState(initialState, true)
    // Clear localStorage
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('should initialize with empty favoriteModels', () => {
    const { result } = renderHook(() => useFavoriteModel())
    expect(result.current.favoriteModels).toEqual([])
  })

  it('should add a model to favorites', () => {
    const { result } = renderHook(() => useFavoriteModel())

    act(() => {
      result.current.addFavorite(mockModel1)
    })

    expect(result.current.favoriteModels).toEqual([mockModel1])
  })

  it('should not add duplicate models', () => {
    const { result } = renderHook(() => useFavoriteModel())

    act(() => {
      result.current.addFavorite(mockModel1)
      result.current.addFavorite(mockModel1)
    })

    expect(result.current.favoriteModels).toEqual([mockModel1])
  })

  it('should remove a model from favorites', () => {
    const { result } = renderHook(() => useFavoriteModel())

    act(() => {
      result.current.addFavorite(mockModel1)
      result.current.addFavorite(mockModel2)
    })

    expect(result.current.favoriteModels).toEqual([mockModel1, mockModel2])

    act(() => {
      result.current.removeFavorite(mockModel1.id)
    })

    expect(result.current.favoriteModels).toEqual([mockModel2])
  })

  it('should handle removing a model that is not a favorite', () => {
    const { result } = renderHook(() => useFavoriteModel())

    act(() => {
      result.current.addFavorite(mockModel1)
    })

    act(() => {
      result.current.removeFavorite(mockModel2.id)
    })

    expect(result.current.favoriteModels).toEqual([mockModel1])
  })

  it('should correctly determine if a model is a favorite', () => {
    const { result } = renderHook(() => useFavoriteModel())

    act(() => {
      result.current.addFavorite(mockModel1)
    })

    expect(result.current.isFavorite(mockModel1.id)).toBe(true)
    expect(result.current.isFavorite(mockModel2.id)).toBe(false)
  })

  it('should toggle favorite status', () => {
    const { result } = renderHook(() => useFavoriteModel())

    // Toggle on
    act(() => {
      result.current.toggleFavorite(mockModel1)
    })
    expect(result.current.favoriteModels).toEqual([mockModel1])

    // Toggle off
    act(() => {
      result.current.toggleFavorite(mockModel1)
    })
    expect(result.current.favoriteModels).toEqual([])
  })

  it('should persist to localStorage', () => {
    const { result } = renderHook(() => useFavoriteModel())

    act(() => {
      result.current.addFavorite(mockModel1)
    })

    const storedData = localStorage.getItem(localStorageKey.favoriteModels)
    expect(storedData).not.toBeNull()

    const parsedData = JSON.parse(storedData as string)
    expect(parsedData.state.favoriteModels).toEqual([mockModel1])
  })
})
