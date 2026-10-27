import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildOptimisticUserMessage } from '../optimisticUserMessage'
import { Attachment } from '@/types/attachment'

vi.mock('ai', () => ({
  generateId: () => 'mocked-generated-id'
}))

describe('buildOptimisticUserMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null if there are no documents and no image files', () => {
    const result = buildOptimisticUserMessage({
      threadId: 'thread-1',
      text: 'hello',
    })
    expect(result).toBeNull()
  })

  it('builds message with imageFiles and messageId provided', () => {
    const result = buildOptimisticUserMessage({
      threadId: 'thread-1',
      text: 'hello',
      messageId: 'custom-id',
      imageFiles: [
        {
          type: 'image/png',
          name: 'test.png',
          mediaType: 'image/png',
          url: 'data:image/png;base64,aGVsbG8=',
        }
      ]
    })
    expect(result).toEqual({
      id: 'custom-id',
      role: 'user',
      parts: [
        { type: 'text', text: 'hello' },
        { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,aGVsbG8=' }
      ],
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      metadata: {}
    })
  })

  it('handles empty text', () => {
    const result = buildOptimisticUserMessage({
      threadId: 'thread-1',
      text: '',
      imageFiles: [
        {
          type: 'image/png',
          name: 'test.png',
          mediaType: 'image/png',
          url: 'data:image/png;base64,aGVsbG8=',
        }
      ]
    })
    expect(result).toEqual({
      id: 'mocked-generated-id',
      role: 'user',
      parts: [
        { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,aGVsbG8=' }
      ],
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      metadata: {}
    })
  })

  it('builds message with documents and auto-generates id', () => {
    const doc: Attachment = {
      name: 'doc.pdf',
      type: 'document',
      mimeType: 'application/pdf',
      path: '/path/to/doc.pdf',
      fileType: 'pdf',
      size: 1024,
      parseMode: 'auto',
    }

    const result = buildOptimisticUserMessage({
      threadId: 'thread-1',
      text: 'check this doc',
      documents: [doc],
    })

    expect(result).toEqual({
      id: 'mocked-generated-id',
      role: 'user',
      parts: [
        { type: 'text', text: 'check this doc\n\n[ATTACHED_FILES]\n- file_id: doc.pdf, name: doc.pdf, type: pdf, size: 1024\n[/ATTACHED_FILES]' },
        { type: 'file', filename: 'doc.pdf', mediaType: 'application/pdf', url: '/path/to/doc.pdf' }
      ],
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      metadata: {
        file_attachments: [
          {
            name: 'doc.pdf',
            path: '/path/to/doc.pdf',
            mediaType: 'application/pdf',
            size: 1024,
            fileType: 'pdf'
          }
        ]
      }
    })
  })

  it('combines images and documents correctly', () => {
    const doc: Attachment = {
      name: 'doc.pdf',
      type: 'document',
      mimeType: 'application/pdf',
      path: '/path/to/doc.pdf',
      fileType: 'pdf',
      size: 1024,
      parseMode: 'auto',
    }

    const imageFile = {
      type: 'image/jpeg',
      name: 'test.jpg',
      mediaType: 'image/jpeg',
      url: 'data:image/jpeg;base64,YmFzZTY0ZGF0YQ==',
    }

    const result = buildOptimisticUserMessage({
      threadId: 'thread-2',
      text: 'look at this image and document',
      imageFiles: [imageFile],
      documents: [doc],
    })

    expect(result).toEqual({
      id: 'mocked-generated-id',
      role: 'user',
      parts: [
        { type: 'text', text: 'look at this image and document\n\n[ATTACHED_FILES]\n- file_id: doc.pdf, name: doc.pdf, type: pdf, size: 1024\n[/ATTACHED_FILES]' },
        { type: 'file', mediaType: 'image/jpeg', url: 'data:image/jpeg;base64,YmFzZTY0ZGF0YQ==' },
        { type: 'file', filename: 'doc.pdf', mediaType: 'application/pdf', url: '/path/to/doc.pdf' }
      ],
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      metadata: {
        file_attachments: [
          {
            name: 'doc.pdf',
            path: '/path/to/doc.pdf',
            mediaType: 'application/pdf',
            size: 1024,
            fileType: 'pdf'
          }
        ]
      }
    })
  })
})
