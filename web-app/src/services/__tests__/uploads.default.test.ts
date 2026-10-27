import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockUlid = vi.hoisted(() => vi.fn(() => 'mocked-ulid-1234'))
const { mockState, mockStateProj } = vi.hoisted(() => ({
  mockState: {
    recordedCalls: [] as any[]
  },
  mockStateProj: {
    recordedCalls: [] as any[]
  }
}))

vi.mock('ulidx', () => ({
  ulid: mockUlid,
}))

vi.mock('@/lib/extension', () => ({
  ExtensionManager: {
    getInstance: vi.fn(),
  },
}))

vi.mock('@janhq/core', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    ExtensionTypeEnum: {
      RAG: 'rag',
    },
  }
})

import { DefaultUploadsService } from '../uploads/default'
import type { Attachment } from '@/types/attachment'
import { ExtensionManager } from '@/lib/extension'

describe('DefaultUploadsService', () => {
  let service: DefaultUploadsService

  beforeEach(() => {
    vi.clearAllMocks()
    mockState.recordedCalls = []
    mockStateProj.recordedCalls = []
    service = new DefaultUploadsService()
  })

  describe('ingestImage', () => {
    it('throws error if attachment is not an image', async () => {
      const attachment: Attachment = { name: 'doc.txt', type: 'document' }
      await expect(service.ingestImage('thread-1', attachment)).rejects.toThrow('ingestImage: attachment is not image')
    })

    it('returns a generated id for an image', async () => {
      const attachment: Attachment = { name: 'image.png', type: 'image' }
      const result = await service.ingestImage('thread-1', attachment)
      expect(result).toEqual({ id: 'mocked-ulid-1234' })
    })
  })

  describe('ingestFileAttachment', () => {
    it('throws error if attachment is not a document', async () => {
      const attachment: Attachment = { name: 'img.png', type: 'image' }
      await expect(service.ingestFileAttachment('thread-1', attachment)).rejects.toThrow('ingestFileAttachment: attachment is not document')
    })

    it('throws error if RAG extension is not available', async () => {
      vi.mocked(ExtensionManager.getInstance).mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
      } as any)

      const attachment: Attachment = { name: 'doc.pdf', type: 'document', path: '/path/to/doc.pdf' }
      await expect(service.ingestFileAttachment('thread-1', attachment)).rejects.toThrow('RAG extension not available')
    })

    it('throws error if RAG extension does not have ingestAttachments', async () => {
      vi.mocked(ExtensionManager.getInstance).mockReturnValue({
        get: vi.fn().mockReturnValue({}),
      } as any)

      const attachment: Attachment = { name: 'doc.pdf', type: 'document', path: '/path/to/doc.pdf' }
      await expect(service.ingestFileAttachment('thread-1', attachment)).rejects.toThrow('RAG extension not available')
    })

    it('throws error if RAG extension throws', async () => {
      const mockIngestAttachments = vi.fn(async () => {
        throw new Error('Some extension error')
      })
      vi.mocked(ExtensionManager.getInstance).mockReturnValue({
        get: vi.fn().mockReturnValue({
          ingestAttachments: mockIngestAttachments,
        }),
      } as any)

      const attachment: Attachment = { name: 'doc.pdf', type: 'document', path: '/path/to/doc.pdf' }
      await expect(service.ingestFileAttachment('thread-1', attachment)).rejects.toThrow('Some extension error')
    })

    it('returns id, size, and chunkCount from RAG extension result', async () => {
      const mockIngestAttachments = vi.fn(async (threadId, files) => {
        mockState.recordedCalls.push({ threadId, files })
        return {
          files: [
            { id: 'rag-id-1', size: 1024, chunk_count: 5 }
          ]
        }
      })
      vi.mocked(ExtensionManager.getInstance).mockReturnValue({
        get: vi.fn().mockReturnValue({
          ingestAttachments: mockIngestAttachments,
        }),
      } as any)

      const attachment: Attachment = { name: 'doc.pdf', type: 'document', path: '/path/to/doc.pdf', fileType: 'pdf', size: 1024 }
      const result = await service.ingestFileAttachment('thread-1', attachment)

      expect(result).toStrictEqual({ id: 'rag-id-1', size: 1024, chunkCount: 5 })
      expect(mockState.recordedCalls).toStrictEqual([{
        threadId: 'thread-1',
        files: [{ path: '/path/to/doc.pdf', name: 'doc.pdf', type: 'pdf', size: 1024 }]
      }])
    })

    it('handles files with string size and chunk_count', async () => {
      const mockIngestAttachments = vi.fn(async (threadId, files) => {
        mockState.recordedCalls.push({ threadId, files })
        return {
          files: [
            { id: 'rag-id-2', size: '2048', chunk_count: '10' }
          ]
        }
      })
      vi.mocked(ExtensionManager.getInstance).mockReturnValue({
        get: vi.fn().mockReturnValue({
          ingestAttachments: mockIngestAttachments,
        }),
      } as any)

      const attachment: Attachment = { name: 'doc.pdf', type: 'document', path: '/path/to/doc.pdf' }
      const result = await service.ingestFileAttachment('thread-1', attachment)

      expect(result).toStrictEqual({ id: 'rag-id-2', size: undefined, chunkCount: undefined })
      expect(mockState.recordedCalls.length).toStrictEqual(1)
    })

    it('throws error if RAG extension result does not contain a valid id', async () => {
      const mockIngestAttachments = vi.fn(async () => {
        return {
          files: []
        }
      })
      vi.mocked(ExtensionManager.getInstance).mockReturnValue({
        get: vi.fn().mockReturnValue({
          ingestAttachments: mockIngestAttachments,
        }),
      } as any)

      const attachment: Attachment = { name: 'doc.pdf', type: 'document', path: '/path/to/doc.pdf' }
      await expect(service.ingestFileAttachment('thread-1', attachment)).rejects.toThrow('Failed to resolve ingested attachment id')
    })
  })

  describe('ingestFileAttachmentForProject', () => {
    it('throws error if attachment is not a document', async () => {
      const attachment: Attachment = { name: 'img.png', type: 'image' }
      await expect(service.ingestFileAttachmentForProject('proj-1', attachment)).rejects.toThrow('ingestFileAttachmentForProject: attachment is not document')
    })

    it('throws error if RAG extension is not available', async () => {
      vi.mocked(ExtensionManager.getInstance).mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
      } as any)

      const attachment: Attachment = { name: 'doc.pdf', type: 'document', path: '/path/to/doc.pdf' }
      await expect(service.ingestFileAttachmentForProject('proj-1', attachment)).rejects.toThrow('RAG extension does not support project-level ingestion')
    })

    it('throws error if RAG extension does not have ingestAttachmentsForProject', async () => {
      vi.mocked(ExtensionManager.getInstance).mockReturnValue({
        get: vi.fn().mockReturnValue({}),
      } as any)

      const attachment: Attachment = { name: 'doc.pdf', type: 'document', path: '/path/to/doc.pdf' }
      await expect(service.ingestFileAttachmentForProject('proj-1', attachment)).rejects.toThrow('RAG extension does not support project-level ingestion')
    })

    it('throws error if RAG extension throws', async () => {
      const mockIngestAttachmentsForProject = vi.fn(async () => {
        throw new Error('Some extension error')
      })
      vi.mocked(ExtensionManager.getInstance).mockReturnValue({
        get: vi.fn().mockReturnValue({
          ingestAttachmentsForProject: mockIngestAttachmentsForProject,
        }),
      } as any)

      const attachment: Attachment = { name: 'doc.pdf', type: 'document', path: '/path/to/doc.pdf' }
      await expect(service.ingestFileAttachmentForProject('proj-1', attachment)).rejects.toThrow('Some extension error')
    })


    it('returns id, size, and chunkCount from RAG extension result', async () => {
      const mockIngestAttachmentsForProject = vi.fn(async (projectId, files) => {
        mockStateProj.recordedCalls.push({ projectId, files })
        return {
          files: [
            { id: 'rag-proj-id-1', size: 1024, chunk_count: 5 }
          ]
        }
      })
      vi.mocked(ExtensionManager.getInstance).mockReturnValue({
        get: vi.fn().mockReturnValue({
          ingestAttachmentsForProject: mockIngestAttachmentsForProject,
        }),
      } as any)

      const attachment: Attachment = { name: 'doc.pdf', type: 'document', path: '/path/to/doc.pdf', fileType: 'pdf', size: 1024 }
      const result = await service.ingestFileAttachmentForProject('proj-1', attachment)

      expect(result).toStrictEqual({ id: 'rag-proj-id-1', size: 1024, chunkCount: 5 })
      expect(mockStateProj.recordedCalls).toStrictEqual([{
        projectId: 'proj-1',
        files: [{ path: '/path/to/doc.pdf', name: 'doc.pdf', type: 'pdf', size: 1024 }]
      }])
    })

    it('handles files with string size and chunk_count', async () => {
      const mockIngestAttachmentsForProject = vi.fn(async (projectId, files) => {
        mockStateProj.recordedCalls.push({ projectId, files })
        return {
          files: [
            { id: 'rag-proj-id-2', size: '2048', chunk_count: '10' }
          ]
        }
      })
      vi.mocked(ExtensionManager.getInstance).mockReturnValue({
        get: vi.fn().mockReturnValue({
          ingestAttachmentsForProject: mockIngestAttachmentsForProject,
        }),
      } as any)

      const attachment: Attachment = { name: 'doc.pdf', type: 'document', path: '/path/to/doc.pdf' }
      const result = await service.ingestFileAttachmentForProject('proj-1', attachment)

      expect(result).toStrictEqual({ id: 'rag-proj-id-2', size: undefined, chunkCount: undefined })
      expect(mockStateProj.recordedCalls.length).toStrictEqual(1)
    })

    it('throws error if RAG extension result does not contain a valid id', async () => {
      const mockIngestAttachmentsForProject = vi.fn(async () => {
        return {
          files: []
        }
      })
      vi.mocked(ExtensionManager.getInstance).mockReturnValue({
        get: vi.fn().mockReturnValue({
          ingestAttachmentsForProject: mockIngestAttachmentsForProject,
        }),
      } as any)

      const attachment: Attachment = { name: 'doc.pdf', type: 'document', path: '/path/to/doc.pdf' }
      await expect(service.ingestFileAttachmentForProject('proj-1', attachment)).rejects.toThrow('Failed to resolve ingested attachment id')
    })
  })
})
