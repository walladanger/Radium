import { describe, it, expect, vi, afterEach } from 'vitest'
import { supportsBlurEffects } from '../blurSupport'
import type { HardwareData } from '@/hooks/useHardware'

describe('supportsBlurEffects', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const baseHardwareData = {
    cpu: {
      arch: 'x86_64',
      core_count: 8,
      extensions: [],
      name: 'Intel Core i7',
      usage: 0,
    },
    gpus: [],
    os_type: '',
    os_name: '',
    total_memory: 16000000000,
  } as HardwareData

  const createHardwareData = (os_type: string, os_name: string): HardwareData => ({
    ...baseHardwareData,
    os_type,
    os_name,
  })

  it('returns false when hardwareData is null', () => {
    expect(supportsBlurEffects(null)).toBe(false)
  })

  it('returns true for macOS', () => {
    const hwData = createHardwareData('macos', 'macOS 14.0')
    expect(supportsBlurEffects(hwData)).toBe(true)
  })

  it('returns true for Windows with build >= 17134', () => {
    const hwData = createHardwareData('windows', 'Windows 10 Pro (build 17134)')
    expect(supportsBlurEffects(hwData)).toBe(true)
  })

  it('returns false for Windows with build < 17134', () => {
    const hwData = createHardwareData('windows', 'Windows 10 Pro (build 17133)')
    expect(supportsBlurEffects(hwData)).toBe(false)
  })

  it('returns true for Windows when build number cannot be detected', () => {
    const hwData = createHardwareData('windows', 'Windows 11')
    expect(supportsBlurEffects(hwData)).toBe(true)
  })

  it('returns true for Linux when window is defined', () => {
    vi.stubGlobal('window', {})
    const hwData = createHardwareData('linux', 'Ubuntu')
    expect(supportsBlurEffects(hwData)).toBe(true)
  })

  it('returns false for Linux when window is undefined', () => {
    vi.stubGlobal('window', undefined)
    const hwData = createHardwareData('linux', 'Ubuntu')
    expect(supportsBlurEffects(hwData)).toBe(false)
  })

  it('returns false for unknown OS types', () => {
    const hwData = createHardwareData('freebsd', 'FreeBSD')
    expect(supportsBlurEffects(hwData)).toBe(false)
  })
})
