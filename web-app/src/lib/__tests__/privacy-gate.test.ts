import { describe, expect, it } from 'vitest'
import {
  applyPrivacyGate,
  createPrivacyState,
  redactText,
  rehydrateText,
  scanSensitiveText,
} from '../privacy-gate'

describe('privacy gate', () => {
  it('redacts sensitive values with request-scoped collision-resistant tokens', () => {
    const state = createPrivacyState([], 'abc123')
    const input = 'Email chef@example.com and use sk-abcdefghijklmnopqrstuvwxyz123456'
    const redacted = redactText(input, state)

    expect(redacted).not.toContain('chef@example.com')
    expect(redacted).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456')
    expect(redacted).toMatch(/\[RDM_abc123_EMAIL_1\]/)
    expect(redacted).toMatch(/\[RDM_abc123_APIKEY_1\]/)
    expect(rehydrateText(redacted, state)).toBe(input)
  })

  it('applies custom terms case-insensitively', () => {
    const state = createPrivacyState(['Project Falcon'], 'term1')
    const redacted = redactText('project falcon is internal', state)
    expect(redacted).toContain('[RDM_term1_TERM_1]')
    expect(redacted).not.toMatch(/project falcon/i)
  })

  it('restores the original casing for custom private terms', () => {
    const state = createPrivacyState(['Project Falcon'], 'case1')
    const redacted = redactText('PROJECT FALCON is private', state)
    expect(rehydrateText(redacted, state)).toBe('PROJECT FALCON is private')
  })

  it('keeps originals out of a fake remote egress payload', () => {
    const outbound = applyPrivacyGate({
      messages: [{ role: 'user', content: 'ops@example.com uses 10.0.0.8' }],
      system: 'API key sk-abcdefghijklmnopqrstuvwxyz123456',
      customTerms: ['Northstar'],
      requestId: 'canary',
    })
    const wirePayload = JSON.stringify({
      messages: outbound.messages,
      system: outbound.system,
    })
    expect(wirePayload).not.toContain('ops@example.com')
    expect(wirePayload).not.toContain('10.0.0.8')
    expect(wirePayload).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456')
  })
  it('does not fabricate hits for invalid card numbers', () => {
    expect(scanSensitiveText('card 4111 1111 1111 1112')).toEqual([])
  })

  it('redacts strings nested in model messages and the system prompt', () => {
    const result = applyPrivacyGate({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Contact ops@example.com' },
            { type: 'image', image: 'data:image/png;base64,AAAA' },
          ],
        },
      ],
      system: 'Internal host 10.1.2.3',
      customTerms: [],
      requestId: 'req9',
    })

    expect(JSON.stringify(result.messages)).not.toContain('ops@example.com')
    expect(result.system).not.toContain('10.1.2.3')
    expect(JSON.stringify(result.messages)).toContain('data:image/png;base64,AAAA')
  })

  it('rehydrates only tokens created by this request', () => {
    const state = createPrivacyState([], 'safe')
    const redacted = redactText('me@example.com', state)
    expect(rehydrateText(redacted + ' [RDM_other_EMAIL_1]', state))
      .toBe('me@example.com [RDM_other_EMAIL_1]')
  })
})

it('redacts data and type in tool payloads while preserving media bytes', () => {
  const input = {
    data: { type: 'ops@example.com', data: ['ops@example.com'] },
    media: { mediaType: 'application/pdf', data: 'ops@example.com' },
    image: 'ops@example.com',
  }
  const { messages } = applyPrivacyGate({ messages: [input], requestId: 'keys' })
  expect(messages[0].data).toEqual({
    type: '[RDM_keys_EMAIL_1]', data: ['[RDM_keys_EMAIL_1]'],
  })
  expect(messages[0].media).toEqual(input.media)
  expect(messages[0].image).toBe(input.image)
})
