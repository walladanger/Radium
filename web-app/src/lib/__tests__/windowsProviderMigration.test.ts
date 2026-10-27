import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { localStorageKey } from '@/constants/localStorage'
import {
  WINDOWS_RECHECK_PENDING_KEY,
  runWindowsLlamacppProviderMigration,
} from '@/lib/windowsProviderMigration'

const MIGRATION_FLAG_KEY = 'atomic_windows_llamacpp_to_upstream_v1'
const WINDOWS_AUTO_RECHECK_FIRED_KEY =
  'atomic_windows_llamacpp_auto_recheck_fired_v1'

describe('runWindowsLlamacppProviderMigration', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does nothing on non-Windows platforms', () => {
    vi.stubGlobal('IS_WINDOWS', false)
    const legacyValue = '{"provider":"llamacpp","model":"test-model"}'
    localStorage.setItem(localStorageKey.lastUsedModel, legacyValue)

    runWindowsLlamacppProviderMigration()

    expect(localStorage.getItem(localStorageKey.lastUsedModel)).toBe(
      legacyValue
    )
    expect(localStorage.getItem(MIGRATION_FLAG_KEY)).toBeNull()
    expect(localStorage.getItem(WINDOWS_AUTO_RECHECK_FIRED_KEY)).toBeNull()
  })

  it('rewrites legacy provider to upstream provider on Windows', () => {
    vi.stubGlobal('IS_WINDOWS', true)
    localStorage.setItem(
      localStorageKey.lastUsedModel,
      '{"provider":"llamacpp","model":"test-model","other":123}'
    )

    runWindowsLlamacppProviderMigration()

    expect(localStorage.getItem(localStorageKey.lastUsedModel)).toBe(
      '{"provider":"llamacpp-upstream","model":"test-model","other":123}'
    )
    expect(localStorage.getItem(MIGRATION_FLAG_KEY)).toBe('done')
    expect(localStorage.getItem(WINDOWS_AUTO_RECHECK_FIRED_KEY)).toBe('done')
    expect(localStorage.getItem(WINDOWS_RECHECK_PENDING_KEY)).toBeNull()
  })

  it('does not rewrite if provider is already upstream', () => {
    vi.stubGlobal('IS_WINDOWS', true)
    const upstreamValue = '{"provider":"llamacpp-upstream","model":"test-model"}'
    localStorage.setItem(localStorageKey.lastUsedModel, upstreamValue)

    runWindowsLlamacppProviderMigration()

    expect(localStorage.getItem(localStorageKey.lastUsedModel)).toBe(
      upstreamValue
    )
    expect(localStorage.getItem(MIGRATION_FLAG_KEY)).toBe('done')
  })

  it('schedules a recheck for an upgraded user (setup completed)', () => {
    vi.stubGlobal('IS_WINDOWS', true)
    localStorage.setItem(localStorageKey.setupCompleted, 'true')

    runWindowsLlamacppProviderMigration()

    expect(localStorage.getItem(WINDOWS_RECHECK_PENDING_KEY)).toBe('1')
    expect(localStorage.getItem(WINDOWS_AUTO_RECHECK_FIRED_KEY)).toBe('done')
  })

  it('does not schedule a recheck for a fresh install (setup not completed)', () => {
    vi.stubGlobal('IS_WINDOWS', true)
    // Setup completed not set

    runWindowsLlamacppProviderMigration()

    expect(localStorage.getItem(WINDOWS_RECHECK_PENDING_KEY)).toBeNull()
    expect(localStorage.getItem(WINDOWS_AUTO_RECHECK_FIRED_KEY)).toBe('done')
  })

  it('is idempotent on a second run', () => {
    vi.stubGlobal('IS_WINDOWS', true)
    localStorage.setItem(MIGRATION_FLAG_KEY, 'done')
    localStorage.setItem(WINDOWS_AUTO_RECHECK_FIRED_KEY, 'done')
    const legacyValue = '{"provider":"llamacpp","model":"test-model"}'
    localStorage.setItem(localStorageKey.lastUsedModel, legacyValue)
    localStorage.setItem(localStorageKey.setupCompleted, 'true')

    runWindowsLlamacppProviderMigration()

    // Values should remain unchanged
    expect(localStorage.getItem(localStorageKey.lastUsedModel)).toBe(
      legacyValue
    )
    expect(localStorage.getItem(WINDOWS_RECHECK_PENDING_KEY)).toBeNull()
  })

  it('does not throw and ignores missing or malformed JSON', () => {
    vi.stubGlobal('IS_WINDOWS', true)
    localStorage.setItem(localStorageKey.lastUsedModel, 'malformed-json')

    expect(() => runWindowsLlamacppProviderMigration()).not.toThrow()

    expect(localStorage.getItem(localStorageKey.lastUsedModel)).toBe(
      'malformed-json'
    )
    expect(localStorage.getItem(MIGRATION_FLAG_KEY)).toBe('done')
    expect(localStorage.getItem(WINDOWS_AUTO_RECHECK_FIRED_KEY)).toBe('done')
  })
})
