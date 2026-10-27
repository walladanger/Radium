import { describe, it, expect } from 'vitest'
import { inlineMediaOf } from '../inlineMedia'

describe('inlineMediaOf', () => {
  it('returns empty array for undefined metadata', () => {
    expect(inlineMediaOf(undefined)).toEqual([])
  })

  it('returns empty array for metadata without media property', () => {
    expect(inlineMediaOf({})).toEqual([])
    expect(inlineMediaOf({ other: 'value' })).toEqual([])
  })

  it('returns empty array for metadata with non-array media property', () => {
    expect(inlineMediaOf({ media: null })).toEqual([])
    expect(inlineMediaOf({ media: 'string' })).toEqual([])
    expect(inlineMediaOf({ media: {} })).toEqual([])
    expect(inlineMediaOf({ media: 123 })).toEqual([])
  })

  it('filters out invalid items in media array', () => {
    const metadata = {
      media: [
        null,
        undefined,
        123,
        'string',
        {},
        { asset_id: '1' }, // Missing path
        { path: 123 }, // Invalid path type
        { path: 'valid/path', asset_id: '2', mime: 'image/png', media_type: 'image' }
      ]
    }
    const result = inlineMediaOf(metadata)
    expect(result).toEqual([
      { path: 'valid/path', asset_id: '2', mime: 'image/png', media_type: 'image' }
    ])
  })

  it('returns all valid items in media array', () => {
    const validItems = [
      { path: 'image.png', asset_id: '1', mime: 'image/png', media_type: 'image' as const },
      { path: 'video.mp4', asset_id: '2', mime: 'video/mp4', media_type: 'video' as const, model_label: 'test' },
      { path: 'audio.mp3', asset_id: '3', mime: 'audio/mp3', media_type: 'audio' as const, prompt: 'hello' }
    ]
    const metadata = { media: validItems }
    const result = inlineMediaOf(metadata)
    expect(result).toEqual(validItems)
  })
})
