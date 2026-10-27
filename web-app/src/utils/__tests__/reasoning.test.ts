import { describe, it, expect } from 'vitest'
import { removeReasoningContent, extractReasoningFromMessage } from '../reasoning'
import { ChatCompletionMessage, chatCompletionRequestMessage } from '@janhq/core'

describe('removeReasoningContent', () => {
  it('leaves content without tags unchanged', () => {
    expect(removeReasoningContent('just a normal answer')).toBe('just a normal answer')
  })

  it('removes reasoning content and trims the result', () => {
    expect(removeReasoningContent('<think>thinking process</think>answer')).toBe('answer')
    expect(removeReasoningContent('<think>thinking</think>   answer   ')).toBe('answer')
  })

  it('works for multi-line think blocks', () => {
    const content = `<think>
line 1
line 2
</think>
multi-line answer`
    expect(removeReasoningContent(content)).toBe('multi-line answer')
  })

  it('only cuts the first think block', () => {
    const content = '<think>first think</think>answer 1 <think>second think</think>answer 2'
    expect(removeReasoningContent(content)).toBe('answer 1 <think>second think</think>answer 2')
  })

  it('leaves content unchanged if <think> is unclosed', () => {
    expect(removeReasoningContent('<think>thinking process answer')).toBe('<think>thinking process answer')
  })

  it('removes harmony format reasoning block', () => {
    const content = '<|channel|>analysis<|message|>analyzing data<|start|>assistant<|channel|>final<|message|>final text'
    expect(removeReasoningContent(content)).toBe('final text')
  })

  it('leaves harmony analysis marker without final marker unchanged', () => {
    const content = '<|channel|>analysis<|message|>analyzing data without end marker'
    expect(removeReasoningContent(content)).toBe(content)
  })
})

describe('extractReasoningFromMessage', () => {
  it('returns reasoning_content when present', () => {
    const message = {
      role: 'assistant',
      content: 'answer',
      reasoning_content: 'my reasoning',
    } as unknown as chatCompletionRequestMessage
    expect(extractReasoningFromMessage(message)).toBe('my reasoning')
  })

  it('falls back to reasoning when reasoning_content is absent', () => {
    const message = {
      role: 'assistant',
      content: 'answer',
      reasoning: 'fallback reasoning',
    } as unknown as chatCompletionRequestMessage
    expect(extractReasoningFromMessage(message)).toBe('fallback reasoning')
  })

  it('prefers reasoning_content over reasoning', () => {
    const message = {
      role: 'assistant',
      content: 'answer',
      reasoning_content: 'primary reasoning',
      reasoning: 'fallback reasoning',
    } as unknown as chatCompletionRequestMessage
    expect(extractReasoningFromMessage(message)).toBe('primary reasoning')
  })

  it('returns null when neither is set', () => {
    const message = {
      role: 'assistant',
      content: 'answer',
    } as chatCompletionRequestMessage
    expect(extractReasoningFromMessage(message)).toBeNull()
  })

  it('returns null for null or undefined message', () => {
    // @ts-expect-error Testing invalid input
    expect(extractReasoningFromMessage(null)).toBeNull()
    // @ts-expect-error Testing invalid input
    expect(extractReasoningFromMessage(undefined)).toBeNull()
  })
})
