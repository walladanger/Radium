import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runMacosLlamacppDefaultMigration } from '../macosLlamacppDefaultMigration'
import { localStorageKey } from '@/constants/localStorage'

const MIGRATION_FLAG_KEY = 'atomic_macos_llamacpp_default_to_upstream_v1'

describe('macosLlamacppDefaultMigration', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('short-circuits on non-macOS platforms without writing', () => {
    vi.stubGlobal('IS_MACOS', false)
    const initialValue = JSON.stringify({ provider: 'llamacpp', model: 'foo' })
    localStorage.setItem(localStorageKey.lastUsedModel, initialValue)

    runMacosLlamacppDefaultMigration()

    expect(localStorage.getItem(localStorageKey.lastUsedModel)).toBe(
      initialValue
    )
    expect(localStorage.getItem(MIGRATION_FLAG_KEY)).toBeNull()
  })

  it('migrates llamacpp to llamacpp-upstream and sets flag on macOS', () => {
    vi.stubGlobal('IS_MACOS', true)
    const initialValue = JSON.stringify({ provider: 'llamacpp', model: 'foo' })
    localStorage.setItem(localStorageKey.lastUsedModel, initialValue)

    runMacosLlamacppDefaultMigration()

    const rewritten = localStorage.getItem(localStorageKey.lastUsedModel)
    expect(rewritten).toBe(
      JSON.stringify({ provider: 'llamacpp-upstream', model: 'foo' })
    )
    expect(localStorage.getItem(MIGRATION_FLAG_KEY)).toBe('done')
  })

  it('does nothing if already migrated (idempotent)', () => {
    vi.stubGlobal('IS_MACOS', true)
    localStorage.setItem(MIGRATION_FLAG_KEY, 'done')
    const initialValue = JSON.stringify({ provider: 'llamacpp', model: 'foo' })
    localStorage.setItem(localStorageKey.lastUsedModel, initialValue)

    runMacosLlamacppDefaultMigration()

    expect(localStorage.getItem(localStorageKey.lastUsedModel)).toBe(
      initialValue
    )
    expect(localStorage.getItem(MIGRATION_FLAG_KEY)).toBe('done')
  })

  it('ignores missing or malformed JSON without throwing', () => {
    vi.stubGlobal('IS_MACOS', true)
    localStorage.setItem(localStorageKey.lastUsedModel, '{ bad json }')

    expect(() => runMacosLlamacppDefaultMigration()).not.toThrow()

    expect(localStorage.getItem(localStorageKey.lastUsedModel)).toBe(
      '{ bad json }'
    )
    expect(localStorage.getItem(MIGRATION_FLAG_KEY)).toBe('done')
  })

  it('ignores other providers', () => {
    vi.stubGlobal('IS_MACOS', true)
    const initialValue = JSON.stringify({ provider: 'openai', model: 'foo' })
    localStorage.setItem(localStorageKey.lastUsedModel, initialValue)

    runMacosLlamacppDefaultMigration()

    expect(localStorage.getItem(localStorageKey.lastUsedModel)).toBe(
      initialValue
    )
    expect(localStorage.getItem(MIGRATION_FLAG_KEY)).toBe('done')
  })
})
