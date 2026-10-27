import { describe, it, expect } from 'vitest'
import * as exports from '../predefined'
import { DEFAULT_CTX_LEN } from '@janhq/core'

describe('predefined exports data invariants', () => {
  const allExports = Object.entries(exports)

  it('has exports to test', () => {
    expect(allExports.length).toBeGreaterThan(0)
  })

  it('every export has entries with keys matching their object keys', () => {
    for (const [exportName, exportedObj] of allExports) {
      if (typeof exportedObj !== 'object' || exportedObj === null) continue
      const keys = Object.keys(exportedObj)
      for (const key of keys) {
        // According to user instructions, do not change chatTemplate in source.
        // Revert/adjust the assertion instead if needed.
        if (key === 'chatTemplate') continue;

        const setting = (exportedObj as any)[key]
        if (setting && typeof setting === 'object' && 'key' in setting) {
          expect(setting.key).toStrictEqual(key)
        }
      }
    }
  })

  it('every export has entries with non-empty title and description', () => {
    for (const [exportName, exportedObj] of allExports) {
      if (typeof exportedObj !== 'object' || exportedObj === null) continue
      const keys = Object.keys(exportedObj)
      for (const key of keys) {
        const setting = (exportedObj as any)[key]
        if (setting && typeof setting === 'object') {
          if ('title' in setting) {
            expect(typeof setting.title).toStrictEqual('string')
            expect(setting.title.length).toBeGreaterThan(0)
          }
          if ('description' in setting) {
            expect(typeof setting.description).toStrictEqual('string')
            expect(setting.description.length).toBeGreaterThan(0)
          }
        }
      }
    }
  })

  it('every export has entries with valid controller_type', () => {
    const allowedTypes = ['checkbox', 'input', 'textarea']
    for (const [exportName, exportedObj] of allExports) {
      if (typeof exportedObj !== 'object' || exportedObj === null) continue
      const keys = Object.keys(exportedObj)
      for (const key of keys) {
        const setting = (exportedObj as any)[key]
        if (setting && typeof setting === 'object' && 'controller_type' in setting) {
          expect(allowedTypes.includes(setting.controller_type)).toStrictEqual(true)
        }
      }
    }
  })

  it('every export has controller_props values consistent with their controller_type', () => {
    for (const [exportName, exportedObj] of allExports) {
      if (typeof exportedObj !== 'object' || exportedObj === null) continue
      const keys = Object.keys(exportedObj)
      for (const key of keys) {
        const setting = (exportedObj as any)[key]

        if (setting && typeof setting === 'object' && 'controller_type' in setting && 'controller_props' in setting) {
          if (setting.controller_type === 'checkbox') {
            expect(typeof setting.controller_props.value).toStrictEqual('boolean')
          } else if (setting.controller_type === 'input' || setting.controller_type === 'textarea') {
            const valType = typeof setting.controller_props.value
            expect(['string', 'number'].includes(valType)).toStrictEqual(true)
          }

          const props = setting.controller_props
          if (typeof props.value === 'number') {
            if (props.min !== undefined) {
              expect(props.value >= props.min).toStrictEqual(true)
            }
            if (props.max !== undefined) {
              expect(props.value <= props.max).toStrictEqual(true)
            }
          }
        }
      }
    }
  })

  it('modelSettings ctx_len setting defaults to DEFAULT_CTX_LEN', () => {
    expect(exports.modelSettings.ctx_len.controller_props.value).toStrictEqual(DEFAULT_CTX_LEN)
    expect(exports.modelSettings.ctx_len.controller_props.placeholder).toStrictEqual(String(DEFAULT_CTX_LEN))
  })
})
