import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLocalScanFolder } from '../useLocalScanFolder'
import { useGeneralSetting } from '@/hooks/useGeneralSetting'

const mocks = vi.hoisted(() => {
  const openMock = vi.fn()
  return {
    openMock,
    useServiceHubMock: vi.fn(() => ({
      dialog: () => ({
        open: openMock,
      }),
    })),
  }
})

vi.mock('@/hooks/useServiceHub', () => ({
  useServiceHub: mocks.useServiceHubMock,
}))

describe('useLocalScanFolder', () => {
  beforeEach(() => {
    useGeneralSetting.setState({ localScanFolders: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('picks a folder and adds it to settings', async () => {
    mocks.openMock.mockResolvedValueOnce('/fake/path/to/models')

    const { result } = renderHook(() => useLocalScanFolder())

    let path: string | null = null
    await act(async () => {
      path = await result.current.pickScanFolder()
    })

    expect(mocks.openMock).toHaveBeenCalledWith({
      multiple: false,
      directory: true,
    })
    expect(path).toBe('/fake/path/to/models')
    expect(useGeneralSetting.getState().localScanFolders).toStrictEqual([
      '/fake/path/to/models',
    ])
  })

  it('returns null if no folder is selected (null result)', async () => {
    mocks.openMock.mockResolvedValueOnce(null)

    const { result } = renderHook(() => useLocalScanFolder())

    let path: string | null = 'should_be_overwritten'
    await act(async () => {
      path = await result.current.pickScanFolder()
    })

    expect(path).toBe(null)
    expect(useGeneralSetting.getState().localScanFolders).toStrictEqual([])
  })

  it('returns null if no folder is selected (empty string result)', async () => {
    mocks.openMock.mockResolvedValueOnce('')

    const { result } = renderHook(() => useLocalScanFolder())

    let path: string | null = 'should_be_overwritten'
    await act(async () => {
      path = await result.current.pickScanFolder()
    })

    expect(path).toBe(null)
    expect(useGeneralSetting.getState().localScanFolders).toStrictEqual([])
  })

  it('returns null if selected is an array', async () => {
    mocks.openMock.mockResolvedValueOnce(['/fake/path1', '/fake/path2'])

    const { result } = renderHook(() => useLocalScanFolder())

    let path: string | null = 'should_be_overwritten'
    await act(async () => {
      path = await result.current.pickScanFolder()
    })

    expect(path).toBe(null)
    expect(useGeneralSetting.getState().localScanFolders).toStrictEqual([])
  })

  it('returns null and logs error if dialog throws', async () => {
    const error = new Error('Dialog failed')
    mocks.openMock.mockRejectedValueOnce(error)

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    const { result } = renderHook(() => useLocalScanFolder())

    let path: string | null = 'should_be_overwritten'
    await act(async () => {
      path = await result.current.pickScanFolder()
    })

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to pick scan folder:',
      error
    )
    expect(path).toBe(null)
    expect(useGeneralSetting.getState().localScanFolders).toStrictEqual([])
  })
})
