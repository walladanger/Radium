import { describe, it, expect, vi } from 'vitest'
import {
  newUserThreadContent,
  newAssistantThreadContent,
  emptyThreadContent,
} from '../completion'
import { ChatCompletionRole, ContentType, MessageStatus } from '@janhq/core'
import { Attachment } from '@/types/attachment'
import { injectFilesIntoPrompt } from '../fileMetadata'

vi.mock('ulidx', () => ({
  ulid: () => 'fixed-ulid',
}))

describe('completion', () => {
  const THREAD_ID = 'test-thread-id'

  describe('newUserThreadContent', () => {
    it('creates content for plain text input without attachments', () => {
      const result = newUserThreadContent(THREAD_ID, 'Hello world')

      expect(result).toStrictEqual({
        type: 'text',
        role: ChatCompletionRole.User,
        content: [
          {
            type: ContentType.Text,
            text: {
              value: 'Hello world',
              annotations: [],
            },
          },
        ],
        id: 'fixed-ulid',
        object: 'thread.message',
        thread_id: THREAD_ID,
        status: MessageStatus.Ready,
        created_at: 0,
        completed_at: 0,
        metadata: undefined,
      })
    })

    it('creates content with explicit id', () => {
      const result = newUserThreadContent(THREAD_ID, 'Hello', [], 'custom-id')
      expect(result.id).toBe('custom-id')
    })

    it('handles image attachments', () => {
      const attachments: Attachment[] = [
        {
          type: 'image',
          name: 'image1.png',
          base64: 'base64data1',
          mimeType: 'image/png',
        },
        {
          type: 'image',
          name: 'invalid.png',
          // Missing base64 and mimeType
        },
      ]

      const result = newUserThreadContent(THREAD_ID, 'Hello', attachments)

      expect(result.content).toStrictEqual([
        {
          type: ContentType.Text,
          text: {
            value: 'Hello',
            annotations: [],
          },
        },
        {
          type: ContentType.Image,
          image_url: {
            url: 'data:image/png;base64,base64data1',
            detail: 'auto',
          },
        },
      ])
      expect(result.metadata).toBeUndefined()
    })

    it('handles audio attachments', () => {
      const attachments: Attachment[] = [
        {
          type: 'audio',
          name: 'audio1.mp3',
          base64: 'base64audio',
          mimeType: 'audio/mp3',
          dataUrl: 'data:audio/mp3;base64,base64audio',
        },
        {
          type: 'audio',
          name: 'audio2.mp3',
          base64: 'base64audio2',
          mimeType: 'audio/mp3',
          // no dataUrl
        },
      ]

      const result = newUserThreadContent(THREAD_ID, 'Listen', attachments)

      expect(result.metadata).toStrictEqual({
        input_audio: [
          {
            name: 'audio1.mp3',
            mediaType: 'audio/mp3',
            url: 'data:audio/mp3;base64,base64audio',
          },
          {
            name: 'audio2.mp3',
            mediaType: 'audio/mp3',
            url: 'data:audio/mp3;base64,base64audio2',
          },
        ],
      })
      expect(result.content).toStrictEqual([
        {
          type: ContentType.Text,
          text: {
            value: 'Listen',
            annotations: [],
          },
        },
      ])
    })

    it('handles document attachments (non-inline)', () => {
      const attachments: Attachment[] = [
        {
          type: 'document',
          id: 'doc-id-1',
          name: 'doc1.pdf',
          fileType: 'pdf',
          size: 1024,
          chunkCount: 10,
          path: '/path/to/doc1.pdf',
          mimeType: 'application/pdf',
        },
        {
          type: 'document',
          // Missing id, should fallback to name
          name: 'doc2.txt',
          fileType: 'txt',
          // Non-numeric size/chunkCount shouldn't be mapped
          size: undefined,
          chunkCount: undefined,
          path: '/path/to/doc2.txt',
          mimeType: 'text/plain',
        },
      ]

      const result = newUserThreadContent(THREAD_ID, 'Read this', attachments)

      const docMetadataForInjection = [
        {
          id: 'doc-id-1',
          name: 'doc1.pdf',
          type: 'pdf',
          size: 1024,
          chunkCount: 10,
          injectionMode: undefined,
        },
        {
          id: 'doc2.txt',
          name: 'doc2.txt',
          type: 'txt',
          size: undefined,
          chunkCount: undefined,
          injectionMode: undefined,
        },
      ]

      const expectedText = injectFilesIntoPrompt('Read this', docMetadataForInjection)

      expect(result.content).toStrictEqual([
        {
          type: ContentType.Text,
          text: {
            value: expectedText,
            annotations: [],
          },
        },
      ])

      expect(result.metadata).toStrictEqual({
        file_attachments: [
          {
            name: 'doc1.pdf',
            path: '/path/to/doc1.pdf',
            mediaType: 'application/pdf',
            size: 1024,
            fileType: 'pdf',
          },
          {
            name: 'doc2.txt',
            path: '/path/to/doc2.txt',
            mediaType: 'text/plain',
            size: undefined,
            fileType: 'txt',
          },
        ],
      })
    })

    it('handles inline document attachments', () => {
      const attachments: Attachment[] = [
        {
          type: 'document',
          id: 'inline-doc-1',
          name: 'snippet.js',
          injectionMode: 'inline',
          inlineContent: 'console.log("hello")',
          path: '/path/snippet.js',
          fileType: 'js',
        },
        {
          type: 'document',
          id: 'inline-doc-2',
          name: 'empty.js',
          injectionMode: 'inline',
          // Missing inlineContent shouldn't be mapped to inlineDocuments
          path: '/path/empty.js',
          fileType: 'js',
        }
      ]

      const result = newUserThreadContent(THREAD_ID, 'Check this', attachments)

      const docMetadataForInjection = [
        {
          id: 'inline-doc-1',
          name: 'snippet.js',
          type: 'js',
          size: undefined,
          chunkCount: undefined,
          injectionMode: 'inline',
        },
        {
          id: 'inline-doc-2',
          name: 'empty.js',
          type: 'js',
          size: undefined,
          chunkCount: undefined,
          injectionMode: 'inline',
        },
      ]

      const expectedText = injectFilesIntoPrompt('Check this', docMetadataForInjection)

      expect(result.content).toStrictEqual([
        {
          type: ContentType.Text,
          text: {
            value: expectedText,
            annotations: [],
          },
        },
      ])

      expect(result.metadata).toStrictEqual({
        inline_file_contents: [
          {
            name: 'snippet.js',
            content: 'console.log("hello")',
          },
        ],
        file_attachments: [
          {
            name: 'snippet.js',
            path: '/path/snippet.js',
            mediaType: undefined,
            size: undefined,
            fileType: 'js',
          },
          {
            name: 'empty.js',
            path: '/path/empty.js',
            mediaType: undefined,
            size: undefined,
            fileType: 'js',
          }
        ],
      })
    })
  })

  describe('newAssistantThreadContent', () => {
    it('creates content with default parameters', () => {
      const result = newAssistantThreadContent(THREAD_ID, 'Assistant response')

      expect(result).toStrictEqual({
        type: 'text',
        role: ChatCompletionRole.Assistant,
        content: [
          {
            type: ContentType.Text,
            text: {
              value: 'Assistant response',
              annotations: [],
            },
          },
        ],
        id: 'fixed-ulid',
        object: 'thread.message',
        thread_id: THREAD_ID,
        status: MessageStatus.Ready,
        created_at: 0,
        completed_at: 0,
        metadata: {},
      })
    })

    it('creates content with explicit id and metadata', () => {
      const result = newAssistantThreadContent(
        THREAD_ID,
        'Assistant response',
        { custom: 'meta' },
        'assistant-id'
      )

      expect(result.id).toBe('assistant-id')
      expect(result.metadata).toStrictEqual({ custom: 'meta' })
    })
  })

  describe('emptyThreadContent', () => {
    it('has the correct shape', () => {
      expect(emptyThreadContent).toStrictEqual({
        type: 'text',
        role: ChatCompletionRole.Assistant,
        id: 'fixed-ulid',
        object: 'thread.message',
        thread_id: '',
        content: [],
        status: MessageStatus.Ready,
        created_at: 0,
        completed_at: 0,
      })
    })
  })
})
