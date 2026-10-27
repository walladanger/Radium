import { describe, it, expect } from 'vitest'
import { presentWebFetchExa } from '../web-fetch-exa'

describe('presentWebFetchExa', () => {
  it('handles typical arguments with a single URL', () => {
    const textEntry = `
Title: Example Page
URL: https://example.com/page
Published: 2024-05-12
Author: John Doe
Highlights:
This is the first highlight.
[...]
This is the second highlight.

This is the third highlight.
This is the fourth highlight.
This is the fifth highlight.
    `.trim()

    const presentation = presentWebFetchExa({
      input: { urls: ['https://example.com/page'] },
      output: [{ text: textEntry }],
    })

    expect(presentation.kind).toBe('web_fetch_exa')
    expect(presentation.title).toBe('Fetched 1 pages')
    expect(presentation.subtitle).toBe('1 URL')
    expect(presentation.urls).toEqual(['https://example.com/page'])
    expect(presentation.pages).toHaveLength(1)
    expect(presentation.pages[0]).toEqual({
      title: 'Example Page',
      url: 'https://example.com/page',
      domain: 'example.com',
      published: '2024-05-12',
      author: 'John Doe',
      highlights: [
        'This is the first highlight.',
        'This is the second highlight.',
        'This is the third highlight.',
        'This is the fourth highlight.',
      ],
    })
    expect(presentation.rawInput).toEqual({ urls: ['https://example.com/page'] })
    expect(presentation.rawOutput).toEqual([{ text: textEntry }])
    expect(presentation.errorText).toBeUndefined()
  })

  it('handles multiple URLs and highlights formatting', () => {
    const textEntry1 = `
Title: First Page
URL: https://first.com
    `.trim()

    const textEntry2 = `
Title: Second Page
URL: https://second.com
    `.trim()

    const presentation = presentWebFetchExa({
      input: { urls: ['https://first.com', 'https://second.com'] },
      output: [{ text: textEntry1 }, { text: textEntry2 }],
    })

    expect(presentation.title).toBe('Fetched 2 pages')
    expect(presentation.subtitle).toBe('2 URLs')
    expect(presentation.urls).toEqual(['https://first.com', 'https://second.com'])
    expect(presentation.pages).toHaveLength(2)
    expect(presentation.pages[0].title).toBe('First Page')
    expect(presentation.pages[1].title).toBe('Second Page')
  })

  it('provides fallback values for missing data', () => {
    const presentation = presentWebFetchExa({
      input: { urls: [] },
      output: [{ text: '' }],
    })

    expect(presentation.title).toBe('Fetched 1 pages')
    expect(presentation.subtitle).toBeUndefined()
    expect(presentation.urls).toEqual([])
    expect(presentation.pages).toHaveLength(1)
    expect(presentation.pages[0]).toEqual({
      title: 'Untitled page',
      url: undefined,
      domain: undefined,
      published: undefined,
      author: undefined,
      highlights: [],
    })
  })

  it('gracefully handles invalid URLs for domain parsing', () => {
    const textEntry = `
URL: not-a-valid-url
    `.trim()

    const presentation = presentWebFetchExa({
      output: [{ text: textEntry }],
    })

    expect(presentation.pages).toHaveLength(1)
    expect(presentation.pages[0].url).toBe('not-a-valid-url')
    expect(presentation.pages[0].domain).toBeUndefined()
  })

  it('handles missing input and output correctly', () => {
    const presentation = presentWebFetchExa({})

    expect(presentation.kind).toBe('web_fetch_exa')
    expect(presentation.title).toBe('Fetched pages')
    expect(presentation.subtitle).toBeUndefined()
    expect(presentation.urls).toEqual([])
    expect(presentation.pages).toEqual([])
    expect(presentation.rawInput).toBeUndefined()
    expect(presentation.rawOutput).toBeUndefined()
  })

  it('handles errorText correctly', () => {
    const presentation = presentWebFetchExa({
      errorText: 'An error occurred during fetch',
    })

    expect(presentation.errorText).toBe('An error occurred during fetch')
  })
})
