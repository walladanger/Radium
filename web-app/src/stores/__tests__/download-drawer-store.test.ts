import { beforeEach, describe, expect, it } from 'vitest'
import {
  useDownloadDrawer,
  isEngineDownload,
  engineBuildName,
  overallDownloadProgress,
} from '../download-drawer-store'
import type { DownloadRowProps } from '@/containers/downloads/DownloadProgressRow'

describe('download-drawer-store', () => {
  const initialState = useDownloadDrawer.getState()
  beforeEach(() => {
    useDownloadDrawer.setState(initialState, true)
  })

  describe('useDownloadDrawer', () => {
    it('setItems with a non-empty list never opens the drawer by itself', () => {
      const row: DownloadRowProps = { id: 'x', progress: 0, current: 0, total: 100 }
      useDownloadDrawer.getState().setItems([row])
      expect(useDownloadDrawer.getState().open).toBe(false)
    })

    it('setOpen(true) then setItems([]) closes it', () => {
      useDownloadDrawer.getState().setOpen(true)
      useDownloadDrawer.getState().setItems([])
      expect(useDownloadDrawer.getState().open).toBe(false)
    })

    it('setOpen(true) then setItems([row]) keeps it open', () => {
      useDownloadDrawer.getState().setOpen(true)
      const row: DownloadRowProps = { id: 'x', progress: 0, current: 0, total: 100 }
      useDownloadDrawer.getState().setItems([row])
      expect(useDownloadDrawer.getState().open).toBe(true)
    })
  })

  describe('isEngineDownload', () => {
    it('returns true for llamacpp prefix', () => {
      expect(isEngineDownload('llamacpp-backend-b1/win-cuda-12.4-x64')).toBe(true)
    })
    it('returns false for model ids', () => {
      expect(isEngineDownload('model-x')).toBe(false)
    })
  })

  describe('engineBuildName', () => {
    it('returns the last path segment', () => {
      expect(engineBuildName('llamacpp/backend/win-cuda')).toBe('win-cuda')
    })
    it('returns the id itself when there is no / or the last segment is empty', () => {
      expect(engineBuildName('abc')).toBe('abc')
      expect(engineBuildName('abc/')).toBe('abc/')
    })
  })

  describe('overallDownloadProgress', () => {
    it('returns 0 for empty list', () => {
      expect(overallDownloadProgress([])).toBe(0)
    })
    it('returns 0 when all totals are 0', () => {
      const items: DownloadRowProps[] = [
        { id: '1', progress: 0, current: 0, total: 0 },
        { id: '2', progress: 0, current: 50, total: 0 },
      ]
      expect(overallDownloadProgress(items)).toBe(0)
    })
    it('ignores rows with total 0 and caps current at total', () => {
      const items: DownloadRowProps[] = [
        { id: '1', progress: 0.5, current: 50, total: 100 },
        { id: '2', progress: 3, current: 300, total: 100 },
        { id: '3', progress: 0, current: 50, total: 0 },
      ]
      expect(overallDownloadProgress(items)).toBe(0.75) // (50 + 100) / 200
    })
  })
})
