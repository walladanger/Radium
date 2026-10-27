import { renderHook, act, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'

import { useRecommendedLocalModel } from '../useRecommendedLocalModel'
import { useDownloadStore } from '../useDownloadStore'
import { useGeneralSetting } from '../useGeneralSetting'
import { useHardwareTier } from '../useHardwareTier'
import { useServiceHub } from '../useServiceHub'
import { ONBOARDING_REMINDER_MODELS } from '@/constants/models'
import type { CatalogModel } from '@/services/models/types'

vi.mock('../useHardwareTier')
vi.mock('../useServiceHub')

const fetchHuggingFaceRepoMock = vi.hoisted(() => vi.fn())
const convertHfRepoToCatalogModelMock = vi.hoisted(() => vi.fn())
const pullModelWithMetadataMock = vi.hoisted(() => vi.fn())

const mockServiceHub = {
  models: () => ({
    fetchHuggingFaceRepo: fetchHuggingFaceRepoMock,
    convertHfRepoToCatalogModel: convertHfRepoToCatalogModelMock,
    pullModelWithMetadata: pullModelWithMetadataMock,
  }),
}

describe('useRecommendedLocalModel', () => {
  const defaultTier = 'vram_8'
  const mockReminder = ONBOARDING_REMINDER_MODELS[defaultTier]

  const mockQuants = [
    { model_id: 'model-Q4_K_M', path: 'path-Q4_K_M', file_size: '1GB' },
    { model_id: 'model-IQ4_XS', path: 'path-IQ4_XS', file_size: '900MB' },
    { model_id: 'model-Q8_0', path: 'path-Q8_0', file_size: '2GB' },
  ]
  const mockCatalogModel: CatalogModel = {
    model_name: 'test-model',
    description: 'test description',
    downloads: 100,
    quants: mockQuants,
    mmproj_models: [{ model_id: 'mmproj-f16', path: 'mmproj-path', file_size: '100MB' }]
  }

  beforeEach(() => {
    vi.mocked(useHardwareTier).mockReturnValue({
      tier: defaultTier,
      profile: { tier: defaultTier, ramGB: 16, vramGB: 8, gpus: [] },
      ready: true,
    })
    vi.mocked(useServiceHub).mockReturnValue(mockServiceHub as unknown as ReturnType<typeof useServiceHub>)

    fetchHuggingFaceRepoMock.mockResolvedValue({ id: 'test-repo' })
    convertHfRepoToCatalogModelMock.mockReturnValue(mockCatalogModel)

    useDownloadStore.setState({
      downloads: {},
      localDownloadingModels: new Set(),
      resumableDownloads: new Set(),
      pausedDownloads: new Set(),
      resumeParams: {},
      downloadOriginByModelId: {},
    })

    useGeneralSetting.setState({
      huggingfaceToken: 'test-token',
    })

    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches and returns the recommended model with correct variant', async () => {
    const { result } = renderHook(() => useRecommendedLocalModel())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.model).toBeNull()
    expect(result.current.variant).toBeNull()
    expect(result.current.reminder).toStrictEqual(mockReminder)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(fetchHuggingFaceRepoMock).toHaveBeenCalledWith(mockReminder.repo, 'test-token')
    expect(convertHfRepoToCatalogModelMock).toHaveBeenCalledWith({ id: 'test-repo' })

    expect(result.current.model).toStrictEqual(mockCatalogModel)

    expect(result.current.variant?.model_id).toBe('model-Q4_K_M')
    expect(result.current.isDownloading).toBe(false)
  })

  it('handles fetch rejection safely', async () => {
    const error = new Error('Network Error')
    fetchHuggingFaceRepoMock.mockRejectedValueOnce(error)
    const { result } = renderHook(() => useRecommendedLocalModel())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.model).toBeNull()
    expect(console.error).toHaveBeenCalledWith('Error fetching the recommended onboarding model:', error)
  })

  it('handles fetch returning null', async () => {
    fetchHuggingFaceRepoMock.mockResolvedValueOnce(null)
    const { result } = renderHook(() => useRecommendedLocalModel())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.model).toBeNull()
    expect(convertHfRepoToCatalogModelMock).not.toHaveBeenCalled()
  })

  it('variant falls back to first quant if no pin or setup quant matches', async () => {
    const oddCatalogModel: CatalogModel = {
      model_name: 'test',
      description: '',
      downloads: 1,
      quants: [
        { model_id: 'model-Q2_K', path: 'path-Q2', file_size: '1GB' },
        { model_id: 'model-Q3_K', path: 'path-Q3', file_size: '1.5GB' }
      ]
    }

    convertHfRepoToCatalogModelMock.mockReturnValueOnce(oddCatalogModel)

    vi.mocked(useHardwareTier).mockReturnValue({
      tier: 'vram_8',
      profile: null,
      ready: true,
    })

    const { result } = renderHook(() => useRecommendedLocalModel())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.variant?.model_id).toBe('model-Q2_K')
  })

  it('isDownloading is true when in localDownloadingModels', async () => {
    useDownloadStore.setState({
      localDownloadingModels: new Set(['model-Q4_K_M'])
    })

    const { result } = renderHook(() => useRecommendedLocalModel())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isDownloading).toBe(true)
  })

  it('isDownloading is true when in downloads map', async () => {
    useDownloadStore.setState({
      downloads: {
        'some-id': { id: 'model-Q4_K_M', progress: 50, name: 'model', current: 50, total: 100, speed: { timestamp: 0, bytes: 0, speed: 0, avgSpeed: 0 } }
      }
    })

    const { result } = renderHook(() => useRecommendedLocalModel())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isDownloading).toBe(true)
  })

  it('startDownload returns null and does nothing if model/variant is null', async () => {
    fetchHuggingFaceRepoMock.mockResolvedValueOnce(null)
    const { result } = renderHook(() => useRecommendedLocalModel())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    let startedId: string | null = null
    act(() => {
      startedId = result.current.startDownload()
    })

    expect(startedId).toBeNull()
    expect(pullModelWithMetadataMock).not.toHaveBeenCalled()
  })

  it('startDownload resolves correct paths and starts download', async () => {
    const { result } = renderHook(() => useRecommendedLocalModel())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    let startedId: string | null = null
    act(() => {
      startedId = result.current.startDownload()
    })

    expect(startedId).toBe('model-Q4_K_M')

    expect(useDownloadStore.getState().localDownloadingModels.has('model-Q4_K_M')).toBe(true)

    expect(pullModelWithMetadataMock).toHaveBeenCalledWith(
      'model-Q4_K_M',
      'path-Q4_K_M',
      'mmproj-path',
      'test-token',
      true,
      false
    )
  })

  it('startDownload passes resume=true if in resumableDownloads', async () => {
    useDownloadStore.setState({
      resumableDownloads: new Set(['model-Q4_K_M'])
    })

    const { result } = renderHook(() => useRecommendedLocalModel())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.startDownload()
    })

    expect(useDownloadStore.getState().resumableDownloads.has('model-Q4_K_M')).toBe(false)

    expect(pullModelWithMetadataMock).toHaveBeenCalledWith(
      'model-Q4_K_M',
      'path-Q4_K_M',
      'mmproj-path',
      'test-token',
      true,
      true
    )
  })
})
