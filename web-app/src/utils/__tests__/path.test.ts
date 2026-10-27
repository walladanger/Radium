import { describe, it, expect, vi, afterEach } from 'vitest'
import { isRootDir } from '../path'

describe('isRootDir', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('Non-Windows behavior', () => {
    it('returns true for common Linux/Mac roots', () => {
      vi.stubGlobal('IS_WINDOWS', false)
      expect(isRootDir('/')).toBe(true)
      expect(isRootDir('/mnt')).toBe(true)
      expect(isRootDir('/media')).toBe(true)
      expect(isRootDir('/boot')).toBe(true)
      expect(isRootDir('/home')).toBe(true)
      expect(isRootDir('/opt')).toBe(true)
      expect(isRootDir('/var')).toBe(true)
      expect(isRootDir('/usr')).toBe(true)
    })

    it('returns true for trailing slashes', () => {
      vi.stubGlobal('IS_WINDOWS', false)
      expect(isRootDir('/home/')).toBe(true)
      expect(isRootDir('//')).toBe(true)
    })

    it('normalizes backslashes', () => {
      vi.stubGlobal('IS_WINDOWS', false)
      expect(isRootDir('\\home')).toBe(true)
    })

    it('returns false for non-roots', () => {
      vi.stubGlobal('IS_WINDOWS', false)
      expect(isRootDir('/home/user')).toBe(false)
      expect(isRootDir('/mnt/data')).toBe(false)
      expect(isRootDir('/tmp')).toBe(false)
    })

    it('normalizes empty string to root and returns true', () => {
      vi.stubGlobal('IS_WINDOWS', false)
      expect(isRootDir('')).toBe(true)
    })
  })

  describe('Windows behavior', () => {
    it('returns true for drive roots', () => {
      vi.stubGlobal('IS_WINDOWS', true)
      expect(isRootDir('C:\\')).toBe(true)
      expect(isRootDir('D:')).toBe(true) // Regex matches D: or D:\
    })

    it('returns false for non-roots', () => {
      vi.stubGlobal('IS_WINDOWS', true)
      expect(isRootDir('C:\\Users')).toBe(false)
    })
  })
})
