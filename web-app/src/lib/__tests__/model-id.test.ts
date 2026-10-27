import { describe, it, expect } from 'vitest'
import { quantFromModelId } from '../model-id'

describe('quantFromModelId', () => {
  it('returns null for undefined input', () => {
    expect(quantFromModelId(undefined)).toBeNull()
  })

  it('returns null for null input', () => {
    expect(quantFromModelId(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(quantFromModelId('')).toBeNull()
  })

  it('extracts Q-based quantization token', () => {
    expect(quantFromModelId('model-Q4_K_M-gguf')).toBe('Q4_K_M')
  })

  it('extracts IQ-based quantization token', () => {
    expect(quantFromModelId('llama-3-IQ4_XS.gguf')).toBe('IQ4_XS')
  })

  it('extracts short Q quantization token', () => {
    expect(quantFromModelId('model-Q4-gguf')).toBe('Q4')
  })

  it('extracts MXFP quantization token', () => {
    expect(quantFromModelId('model-MXFP8')).toBe('MXFP8')
  })

  it('extracts bit-based quantization token', () => {
    expect(quantFromModelId('model-4bit')).toBe('4bit')
  })

  it('extracts bf16 quantization token', () => {
    expect(quantFromModelId('model-bf16')).toBe('bf16')
  })

  it('extracts fp16 quantization token', () => {
    expect(quantFromModelId('model-fp16')).toBe('fp16')
  })

  it('extracts fp8 quantization token', () => {
    expect(quantFromModelId('model-fp8')).toBe('fp8')
  })

  it('extracts f16 quantization token', () => {
    expect(quantFromModelId('model-f16')).toBe('f16')
  })

  it('extracts f32 quantization token', () => {
    expect(quantFromModelId('model-f32')).toBe('f32')
  })

  it('extracts tokens case-insensitively', () => {
    expect(quantFromModelId('model-iq4_xs-gguf')).toBe('iq4_xs')
  })

  it('returns null when no quantization token is matched', () => {
    expect(quantFromModelId('llama-3-base-gguf')).toBeNull()
  })
})
