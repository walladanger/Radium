import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAttachments } from '../useAttachments'

const mockUpdateSettingsCalls = vi.hoisted(() => {
  return { calls: [] as any[] }
})

const mockGetSettingsResult = vi.hoisted(() => {
  return { value: undefined as any }
})

vi.mock('@/lib/extension', () => ({
  ExtensionManager: {
    getInstance: vi.fn(() => ({
      get: vi.fn(() => {
        return {
          getSettings: vi.fn(async () => mockGetSettingsResult.value),
          updateSettings: vi.fn(async (payload) => {
            mockUpdateSettingsCalls.calls.push(payload)
          }),
        }
      }),
    })),
  },
}))

describe('useAttachments', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockUpdateSettingsCalls.calls = []
    mockGetSettingsResult.value = undefined

    // Reset store state
    useAttachments.setState({
      enabled: true,
      maxFileSizeMB: 20,
      retrievalLimit: 3,
      retrievalThreshold: 0.3,
      chunkSizeChars: 512,
      overlapChars: 64,
      searchMode: 'auto',
      parseMode: 'auto',
      autoInlineContextRatio: 0.75,
      settingsDefs: [],
    })
  })

  afterEach(() => {
    vi.runAllTimers()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('has correct initial state', () => {
    const { result } = renderHook(() => useAttachments())

    expect(result.current.enabled).toBe(true)
    expect(result.current.maxFileSizeMB).toBe(20)
    expect(result.current.retrievalLimit).toBe(3)
    expect(result.current.retrievalThreshold).toBe(0.3)
    expect(result.current.chunkSizeChars).toBe(512)
    expect(result.current.overlapChars).toBe(64)
    expect(result.current.searchMode).toBe('auto')
    expect(result.current.parseMode).toBe('auto')
    expect(result.current.autoInlineContextRatio).toBe(0.75)
    expect(result.current.settingsDefs).toStrictEqual([])
  })

  describe('loadSettingsDefs', () => {
    it('returns false if getSettings fails or returns non-array', async () => {
      mockGetSettingsResult.value = null

      let success = false
      await act(async () => {
        success = await useAttachments.getState().loadSettingsDefs()
      })

      expect(success).toBe(false)
    })

    it('loads settings and updates store state', async () => {
      mockGetSettingsResult.value = [
        { key: 'enabled', controllerProps: { value: false } },
        { key: 'max_file_size_mb', controllerProps: { value: 50 } },
        { key: 'retrieval_limit', controllerProps: { value: 5 } },
        { key: 'retrieval_threshold', controllerProps: { value: 0.5 } },
        { key: 'chunk_size_chars', controllerProps: { value: 1024 } },
        { key: 'overlap_chars', controllerProps: { value: 128 } },
        { key: 'search_mode', controllerProps: { value: 'ann' } },
        { key: 'parse_mode', controllerProps: { value: 'inline' } },
        { key: 'auto_inline_context_ratio', controllerProps: { value: 0.5 } },
      ]

      let success = false
      await act(async () => {
        success = await useAttachments.getState().loadSettingsDefs()
      })

      expect(success).toBe(true)
      const state = useAttachments.getState()
      expect(state.enabled).toBe(false)
      expect(state.maxFileSizeMB).toBe(50)
      expect(state.retrievalLimit).toBe(5)
      expect(state.retrievalThreshold).toBe(0.5)
      expect(state.chunkSizeChars).toBe(1024)
      expect(state.overlapChars).toBe(128)
      expect(state.searchMode).toBe('ann')
      expect(state.parseMode).toBe('inline')
      expect(state.autoInlineContextRatio).toBe(0.5)
      expect(state.settingsDefs).toStrictEqual(mockGetSettingsResult.value)
    })

    it('uses fallback keys like chunk_size_tokens', async () => {
      mockGetSettingsResult.value = [
        { key: 'chunk_size_tokens', controllerProps: { value: 1024 } },
        { key: 'overlap_tokens', controllerProps: { value: 128 } },
      ]

      await act(async () => {
        await useAttachments.getState().loadSettingsDefs()
      })

      const state = useAttachments.getState()
      expect(state.chunkSizeChars).toBe(1024)
      expect(state.overlapChars).toBe(128)
    })
  })

  describe('setters', () => {
    beforeEach(async () => {
      mockGetSettingsResult.value = [
        { key: 'enabled', controllerProps: { value: true } },
        { key: 'max_file_size_mb', controllerProps: { value: 20 } },
        { key: 'retrieval_limit', controllerProps: { value: 3 } },
        { key: 'retrieval_threshold', controllerProps: { value: 0.3 } },
        { key: 'chunk_size_chars', controllerProps: { value: 512 } },
        { key: 'overlap_chars', controllerProps: { value: 64 } },
        { key: 'search_mode', controllerProps: { value: 'auto' } },
        { key: 'parse_mode', controllerProps: { value: 'auto' } },
        { key: 'auto_inline_context_ratio', controllerProps: { value: 0.75 } },
      ]
      await act(async () => {
        await useAttachments.getState().loadSettingsDefs()
      })
      mockUpdateSettingsCalls.calls = []
    })

    it('setEnabled updates state and calls updateSettings', async () => {
      const { result } = renderHook(() => useAttachments())

      await act(async () => {
        await result.current.setEnabled(false)
      })

      expect(result.current.enabled).toBe(false)
      expect(result.current.settingsDefs.find(d => d.key === 'enabled')?.controllerProps?.value).toBe(false)
      expect(mockUpdateSettingsCalls.calls).toStrictEqual([
        [{ key: 'enabled', controllerProps: { value: false } }]
      ])
    })

    it('setMaxFileSizeMB updates state and calls updateSettings', async () => {
      const { result } = renderHook(() => useAttachments())

      await act(async () => {
        await result.current.setMaxFileSizeMB(100)
      })

      expect(result.current.maxFileSizeMB).toBe(100)
      expect(result.current.settingsDefs.find(d => d.key === 'max_file_size_mb')?.controllerProps?.value).toBe(100)
      expect(mockUpdateSettingsCalls.calls).toStrictEqual([
        [{ key: 'max_file_size_mb', controllerProps: { value: 100 } }]
      ])
    })

    it('setRetrievalLimit updates state and calls updateSettings', async () => {
      const { result } = renderHook(() => useAttachments())

      await act(async () => {
        await result.current.setRetrievalLimit(10)
      })

      expect(result.current.retrievalLimit).toBe(10)
      expect(result.current.settingsDefs.find(d => d.key === 'retrieval_limit')?.controllerProps?.value).toBe(10)
      expect(mockUpdateSettingsCalls.calls).toStrictEqual([
        [{ key: 'retrieval_limit', controllerProps: { value: 10 } }]
      ])
    })

    it('setRetrievalThreshold updates state and calls updateSettings', async () => {
      const { result } = renderHook(() => useAttachments())

      await act(async () => {
        await result.current.setRetrievalThreshold(0.8)
      })

      expect(result.current.retrievalThreshold).toBe(0.8)
      expect(result.current.settingsDefs.find(d => d.key === 'retrieval_threshold')?.controllerProps?.value).toBe(0.8)
      expect(mockUpdateSettingsCalls.calls).toStrictEqual([
        [{ key: 'retrieval_threshold', controllerProps: { value: 0.8 } }]
      ])
    })

    it('setChunkSizeChars updates state and calls updateSettings', async () => {
      const { result } = renderHook(() => useAttachments())

      await act(async () => {
        await result.current.setChunkSizeChars(2048)
      })

      expect(result.current.chunkSizeChars).toBe(2048)
      expect(result.current.settingsDefs.find(d => d.key === 'chunk_size_chars')?.controllerProps?.value).toBe(2048)
      expect(mockUpdateSettingsCalls.calls).toStrictEqual([
        [{ key: 'chunk_size_chars', controllerProps: { value: 2048 } }]
      ])
    })

    it('setOverlapChars updates state and calls updateSettings', async () => {
      const { result } = renderHook(() => useAttachments())

      await act(async () => {
        await result.current.setOverlapChars(256)
      })

      expect(result.current.overlapChars).toBe(256)
      expect(result.current.settingsDefs.find(d => d.key === 'overlap_chars')?.controllerProps?.value).toBe(256)
      expect(mockUpdateSettingsCalls.calls).toStrictEqual([
        [{ key: 'overlap_chars', controllerProps: { value: 256 } }]
      ])
    })

    it('setSearchMode updates state and calls updateSettings', async () => {
      const { result } = renderHook(() => useAttachments())

      await act(async () => {
        await result.current.setSearchMode('linear')
      })

      expect(result.current.searchMode).toBe('linear')
      expect(result.current.settingsDefs.find(d => d.key === 'search_mode')?.controllerProps?.value).toBe('linear')
      expect(mockUpdateSettingsCalls.calls).toStrictEqual([
        [{ key: 'search_mode', controllerProps: { value: 'linear' } }]
      ])
    })

    it('setParseMode updates state and calls updateSettings', async () => {
      const { result } = renderHook(() => useAttachments())

      await act(async () => {
        await result.current.setParseMode('embeddings')
      })

      expect(result.current.parseMode).toBe('embeddings')
      expect(result.current.settingsDefs.find(d => d.key === 'parse_mode')?.controllerProps?.value).toBe('embeddings')
      expect(mockUpdateSettingsCalls.calls).toStrictEqual([
        [{ key: 'parse_mode', controllerProps: { value: 'embeddings' } }]
      ])
    })

    it('setAutoInlineContextRatio updates state and calls updateSettings', async () => {
      const { result } = renderHook(() => useAttachments())

      await act(async () => {
        await result.current.setAutoInlineContextRatio(0.9)
      })

      expect(result.current.autoInlineContextRatio).toBe(0.9)
      expect(result.current.settingsDefs.find(d => d.key === 'auto_inline_context_ratio')?.controllerProps?.value).toBe(0.9)
      expect(mockUpdateSettingsCalls.calls).toStrictEqual([
        [{ key: 'auto_inline_context_ratio', controllerProps: { value: 0.9 } }]
      ])
    })
  })

  describe('missing functionality', () => {
    it.skip('adds an attachment', () => {
      // bug: hook does not implement adding attachments
    })

    it.skip('removes an attachment', () => {
      // bug: hook does not implement removing attachments
    })

    it.skip('clears all attachments', () => {
      // bug: hook does not implement clearing attachments
    })

    it.skip('enforces deduplication', () => {
      // bug: hook does not implement deduplication
    })

    it.skip('enforces size limits', () => {
      // bug: hook does not implement size limit enforcement
    })

    it.skip('enforces type limits', () => {
      // bug: hook does not implement type limit enforcement
    })

    it.skip('has persisted fields', () => {
      // bug: hook does not implement persistence for attachments
    })

    it.skip('has derived values', () => {
      // bug: hook does not implement derived values for attachments
    })
  })
})
