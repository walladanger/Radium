import { expect, it } from 'vitest'
import { readContextUsage } from './context-usage'

it('rejects malformed imported counts and preserves missing metrics as unknown', () => {
  for (const count of [NaN, Infinity, -1, '100']) {
    expect(readContextUsage({ categories: { messages: count }, updatedAt: 1 })).toBeUndefined()
  }
  const usage = readContextUsage({ categories: { messages: 20 }, updatedAt: 1, contextWindow: 4096 })
  expect(usage?.categories).toEqual({ messages: 20 })
  expect(usage?.categories.memoryFiles).toBeUndefined()
  expect(usage?.contextWindow).toBe(4096)
})
