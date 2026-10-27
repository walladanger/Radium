import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { bootStep, bootReady, bootFail, bootLog, BootLogLevel } from '../boot'

describe('boot', () => {
  let calls: any[] = []

  beforeEach(() => {
    calls = []
  })

  afterEach(() => {
    delete (window as any).__radiumBoot
    vi.unstubAllGlobals()
  })

  const setupBootApi = (shouldThrow = false) => {
    const recordCall =
      (name: string) =>
      (...args: any[]) => {
        if (shouldThrow) {
          throw new Error('Injected error')
        }
        calls.push([name, ...args])
      }
    ;(window as any).__radiumBoot = {
      step: recordCall('step'),
      ready: recordCall('ready'),
      fail: recordCall('fail'),
      log: recordCall('log'),
    }
  }

  describe('bootStep', () => {
    it('calls __radiumBoot.step with the given id and label', () => {
      setupBootApi()
      bootStep('init')
      expect(calls).toEqual([['step', 'init', undefined]])

      calls = []
      bootStep('load', 'Loading...')
      expect(calls).toEqual([['step', 'load', 'Loading...']])
    })

    it('does not throw if __radiumBoot is missing', () => {
      delete (window as any).__radiumBoot
      expect(() => bootStep('init')).not.toThrow()
      expect(calls).toEqual([])
    })

    it('does not throw if __radiumBoot.step throws', () => {
      setupBootApi(true)
      expect(() => bootStep('init')).not.toThrow()
      expect(calls).toEqual([])
    })
  })

  describe('bootReady', () => {
    it('calls __radiumBoot.ready with the given reason', () => {
      setupBootApi()
      bootReady()
      expect(calls).toEqual([['ready', undefined]])

      calls = []
      bootReady('All loaded')
      expect(calls).toEqual([['ready', 'All loaded']])
    })

    it('does not throw if __radiumBoot is missing', () => {
      delete (window as any).__radiumBoot
      expect(() => bootReady()).not.toThrow()
      expect(calls).toEqual([])
    })

    it('does not throw if __radiumBoot.ready throws', () => {
      setupBootApi(true)
      expect(() => bootReady()).not.toThrow()
      expect(calls).toEqual([])
    })
  })

  describe('bootFail', () => {
    it('calls __radiumBoot.fail with Error object', () => {
      setupBootApi()
      const error = new Error('Disk full')
      bootFail(error, 'Startup')
      expect(calls).toEqual([['fail', error, 'Startup']])
    })

    it('calls __radiumBoot.fail with non-Error value', () => {
      setupBootApi()
      bootFail('Not an error', 'Loading data')
      expect(calls).toEqual([['fail', 'Not an error', 'Loading data']])
    })

    it('calls __radiumBoot.fail without where argument', () => {
      setupBootApi()
      bootFail('Crash')
      expect(calls).toEqual([['fail', 'Crash', undefined]])
    })

    it('does not throw if __radiumBoot is missing', () => {
      delete (window as any).__radiumBoot
      expect(() => bootFail('Crash')).not.toThrow()
      expect(calls).toEqual([])
    })

    it('does not throw if __radiumBoot.fail throws', () => {
      setupBootApi(true)
      expect(() => bootFail('Crash')).not.toThrow()
      expect(calls).toEqual([])
    })
  })

  describe('bootLog', () => {
    it('calls __radiumBoot.log with BootLogLevel.info by default and prefixes message', () => {
      setupBootApi()
      bootLog('Hello world')
      expect(calls).toEqual([['log', BootLogLevel.info, '[boot] Hello world']])
    })

    it('calls __radiumBoot.log with specified level', () => {
      setupBootApi()
      bootLog('Low memory', BootLogLevel.warn)
      expect(calls).toEqual([['log', BootLogLevel.warn, '[boot] Low memory']])

      calls = []
      bootLog('Failed to load', BootLogLevel.error)
      expect(calls).toEqual([
        ['log', BootLogLevel.error, '[boot] Failed to load'],
      ])
    })

    it('does not throw if __radiumBoot is missing', () => {
      delete (window as any).__radiumBoot
      expect(() => bootLog('Hello')).not.toThrow()
      expect(calls).toEqual([])
    })

    it('does not throw if __radiumBoot.log throws', () => {
      setupBootApi(true)
      expect(() => bootLog('Hello')).not.toThrow()
      expect(calls).toEqual([])
    })
  })

  describe('BootLogLevel', () => {
    it('has the correct values', () => {
      expect(BootLogLevel.info).toBe(3)
      expect(BootLogLevel.warn).toBe(4)
      expect(BootLogLevel.error).toBe(5)
    })
  })
})
