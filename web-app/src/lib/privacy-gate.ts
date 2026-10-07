/**
 * Radium privacy gate.
 *
 * Deterministically redacts common secrets/PII before a request leaves the
 * device. Mappings are request-scoped and stay in renderer memory only.
 */

export interface PrivacyGateSettings {
  enabled: boolean
  customTerms: string[]
  rehydrateResponses: boolean
}

export interface PrivacyState {
  requestId: string
  map: Map<string, string>
  reverse: Map<string, string>
  counts: Record<string, number>
  customTerms: string[]
}

export interface PrivacyGateResult<T> {
  messages: T[]
  system?: string
  state: PrivacyState
  redactionCount: number
  counts: Record<string, number>
}

export const PRIVACY_GATE_STORAGE_KEY = 'radium.privacy-gate.v1'

export const DEFAULT_PRIVACY_GATE_SETTINGS: PrivacyGateSettings = {
  enabled: false,
  customTerms: [],
  rehydrateResponses: true,
}

type RuleContext = { offset: number; full: string }

type PrivacyRule = {
  type: string
  re: RegExp
  validate?: (match: string, context: RuleContext) => boolean
}

export function luhn(digits: string): boolean {
  let sum = 0
  let alternate = false
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = Number(digits[i])
    if (alternate) {
      value *= 2
      if (value > 9) value -= 9
    }
    sum += value
    alternate = !alternate
  }
  return sum % 10 === 0
}

export const PRIVACY_RULES: PrivacyRule[] = [
  { type: 'AWSKEY', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  {
    type: 'APIKEY',
    re: /\b(?:sk-ant-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
  },
  {
    type: 'JWT',
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    type: 'EMAIL',
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  { type: 'IBAN', re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g },
  {
    type: 'CARD',
    re: /\b(?:\d[ -]*?){13,19}\b/g,
    validate: (match) => {
      const digits = match.replace(/\D/g, '')
      return digits.length >= 13 && digits.length <= 19 && luhn(digits)
    },
  },
  {
    type: 'SSN',
    re: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
  },
  {
    type: 'PHONE',
    re: /(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?|\d{2,4}[ .-])\d{3,4}[ .-]?\d{3,4}/g,
    validate: (match, context) => {
      const digits = match.replace(/\D/g, '')
      if (digits.length < 7 || digits.length > 15) return false
      const after = context.full.slice(context.offset + match.length)
      const before = context.full.slice(0, context.offset)
      if (/^[ .-]?\d/.test(after)) return false
      if (/\d[ .-]?$/.test(before)) return false
      return true
    },
  },
  {
    type: 'IPV4',
    re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  },
  {
    type: 'POSTCODE_UK',
    re: /\b[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}\b/g,
  },
]

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\  return value.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')')
}

function makeRequestId(): string {
  const cryptoObject = globalThis.crypto
  if (cryptoObject?.randomUUID) {
    return cryptoObject.randomUUID().replace(/-/g, '').slice(0, 12)
  }
  const random = Math.random().toString(36).slice(2, 10)
  return `${Date.now().toString(36)}${random}`.slice(0, 12)
}

export function createPrivacyState(
  customTerms: string[] = [],
  requestId = makeRequestId()
): PrivacyState {
  return {
    requestId,
    map: new Map(),
    reverse: new Map(),
    counts: {},
    customTerms: customTerms.map((term) => term.trim()).filter(Boolean),
  }
}

function tokenFor(
  type: string,
  original: string,
  state: PrivacyState,
  keyValue = original
): string {
  const key = `${type}:${keyValue}`
  const existing = state.map.get(key)
  if (existing) return existing

  state.counts[type] = (state.counts[type] ?? 0) + 1
  const token = `[RDM_${state.requestId}_${type}_${state.counts[type]}]`
  state.map.set(key, token)
  state.reverse.set(token, original)
  return token
}

export function redactText(text: string, state: PrivacyState): string {
  if (!text) return text
  if (/^(?:data|blob):/i.test(text)) return text

  let output = text
  for (const rule of PRIVACY_RULES) {
    output = output.replace(rule.re, (match: string, ...rest: unknown[]) => {
      const offset = Number(rest[rest.length - 2])
      const full = String(rest[rest.length - 1])
      if (rule.validate && !rule.validate(match, { offset, full })) return match
      return tokenFor(rule.type, match, state)
    })
  }

  for (const term of state.customTerms) {
    const regex = new RegExp(escapeRegex(term), 'gi')
    output = output.replace(regex, (match) =>
      tokenFor('TERM', match, state, match.toLowerCase())
    )
  }

  return output
}

function redactValue<T>(value: T, state: PrivacyState): T {
  if (typeof value === 'string') {
    return redactText(value, state) as T
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, state)) as T
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (
        key === 'data' ||
        key === 'image' ||
        key === 'mediaType' ||
        key === 'type' ||
        key === 'toolCallId' ||
        key === 'toolName'
      ) {
        output[key] = entry
      } else {
        output[key] = redactValue(entry, state)
      }
    }
    return output as T
  }
  return value
}

export function applyPrivacyGate<T>({
  messages,
  system,
  customTerms = [],
  requestId,
}: {
  messages: T[]
  system?: string
  customTerms?: string[]
  requestId?: string
}): PrivacyGateResult<T> {
  const state = createPrivacyState(customTerms, requestId)
  const redactedMessages = redactValue(messages, state)
  const redactedSystem =
    typeof system === 'string' ? redactText(system, state) : system

  return {
    messages: redactedMessages,
    system: redactedSystem,
    state,
    redactionCount: state.map.size,
    counts: { ...state.counts },
  }
}

export function rehydrateText(text: string, state: PrivacyState): string {
  if (!text || state.reverse.size === 0) return text
  let output = text
  for (const [token, original] of state.reverse.entries()) {
    output = output.split(token).join(original)
  }
  return output
}

export function scanSensitiveText(text: string): Array<{ type: string; count: number }> {
  const full = String(text)
  const hits: Array<{ type: string; count: number }> = []

  for (const rule of PRIVACY_RULES) {
    const regex = new RegExp(rule.re.source, rule.re.flags)
    let count = 0
    for (const match of full.matchAll(regex)) {
      const value = match[0]
      const offset = match.index ?? 0
      if (rule.validate && !rule.validate(value, { offset, full })) continue
      count += 1
    }
    if (count > 0) hits.push({ type: rule.type, count })
  }

  return hits
}

export function readPrivacyGateSettings(): PrivacyGateSettings {
  if (typeof window === 'undefined') return DEFAULT_PRIVACY_GATE_SETTINGS
  try {
    const raw = window.localStorage.getItem(PRIVACY_GATE_STORAGE_KEY)
    if (!raw) return DEFAULT_PRIVACY_GATE_SETTINGS
    const parsed = JSON.parse(raw) as Partial<PrivacyGateSettings>
    return {
      enabled: parsed.enabled === true,
      customTerms: Array.isArray(parsed.customTerms)
        ? parsed.customTerms.filter((term): term is string => typeof term === 'string')
        : [],
      rehydrateResponses: parsed.rehydrateResponses !== false,
    }
  } catch {
    return DEFAULT_PRIVACY_GATE_SETTINGS
  }
}

export function writePrivacyGateSettings(settings: PrivacyGateSettings): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PRIVACY_GATE_STORAGE_KEY, JSON.stringify(settings))
}
