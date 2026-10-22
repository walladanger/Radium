export type ContextUsage = {
  categories: Record<string, number>
  updatedAt: number
  contextWindow?: number
  estimated: true
}

/** Persisted/imported metadata is data, not a trusted numeric schema. */
export function readContextUsage(value: unknown): ContextUsage | undefined {
  if (!value || typeof value !== 'object') return
  const record = value as Partial<ContextUsage>
  if (!record.categories || typeof record.categories !== 'object' || Array.isArray(record.categories) ||
      typeof record.updatedAt !== 'number' || !Number.isFinite(new Date(record.updatedAt).getTime()) || record.updatedAt < 0) return
  const entries = Object.entries(record.categories)
  if (!entries.length || entries.some(([, count]) => typeof count !== 'number' || !Number.isFinite(count) || count < 0 || count > 1e12)) return
  return {
    categories: Object.fromEntries(entries.map(([key, count]) => [key, Math.floor(count)])),
    updatedAt: record.updatedAt,
    contextWindow: typeof record.contextWindow === 'number' && Number.isFinite(record.contextWindow) && record.contextWindow > 0 ? record.contextWindow : undefined,
    estimated: true,
  }
}
