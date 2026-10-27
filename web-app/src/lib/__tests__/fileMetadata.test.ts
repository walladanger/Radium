import { describe, it, expect } from 'vitest'
import {
  injectFilesIntoPrompt,
  extractFilesFromPrompt,
  FileMetadata,
} from '../fileMetadata'

describe('fileMetadata', () => {
  describe('injectFilesIntoPrompt', () => {
    it('returns the prompt unchanged when files array is empty or undefined', () => {
      const prompt = 'Hello world'
      expect(injectFilesIntoPrompt(prompt, [])).toBe(prompt)
      expect(injectFilesIntoPrompt(prompt, undefined as unknown as FileMetadata[])).toBe(prompt)
    })

    it('appends metadata block correctly for one file with only id and name', () => {
      const prompt = 'Analyze this'
      const files: FileMetadata[] = [{ id: '123', name: 'test.txt' }]
      const expected = 'Analyze this\n\n[ATTACHED_FILES]\n- file_id: 123, name: test.txt\n[/ATTACHED_FILES]'

      expect(injectFilesIntoPrompt(prompt, files)).toBe(expected)
    })

    it('includes optional fields (type, size, chunks, mode) in the correct order when set, including zero values', () => {
      const prompt = 'Prompt'
      const files: FileMetadata[] = [{
        id: 'abc',
        name: 'data.json',
        type: 'application/json',
        size: 0,
        chunkCount: 0,
        injectionMode: 'embeddings',
      }]
      const expected = 'Prompt\n\n[ATTACHED_FILES]\n- file_id: abc, name: data.json, type: application/json, size: 0, chunks: 0, mode: embeddings\n[/ATTACHED_FILES]'

      expect(injectFilesIntoPrompt(prompt, files)).toBe(expected)
    })

    it('formats multiple files, one per line', () => {
      const prompt = 'Compare these'
      const files: FileMetadata[] = [
        { id: '1', name: 'a.txt' },
        { id: '2', name: 'b.pdf', size: 1024, injectionMode: 'inline' },
      ]
      const expected = 'Compare these\n\n[ATTACHED_FILES]\n- file_id: 1, name: a.txt\n- file_id: 2, name: b.pdf, size: 1024, mode: inline\n[/ATTACHED_FILES]'

      expect(injectFilesIntoPrompt(prompt, files)).toBe(expected)
    })
  })

  describe('extractFilesFromPrompt', () => {
    it('returns no files and unchanged prompt when block is missing', () => {
      const prompt = 'Just a normal prompt'
      const result = extractFilesFromPrompt(prompt)

      expect(result.files).toEqual([])
      expect(result.cleanPrompt).toBe(prompt)
    })

    it('round-trips injectFilesIntoPrompt output, returning original files and clean prompt', () => {
      const originalPrompt = 'Analyze these files please'
      const originalFiles: FileMetadata[] = [
        { id: '1', name: 'a.txt' },
        {
          id: '2',
          name: 'b.csv',
          type: 'text/csv',
          size: 500,
          chunkCount: 2,
          injectionMode: 'embeddings',
        },
      ]

      const injected = injectFilesIntoPrompt(originalPrompt, originalFiles)
      const extracted = extractFilesFromPrompt(injected)

      expect(extracted.files).toEqual(originalFiles)
      expect(extracted.cleanPrompt).toBe(originalPrompt)
    })

    it('parses numeric fields back to numbers', () => {
      const block = 'Prompt\n\n[ATTACHED_FILES]\n- file_id: 1, name: a, size: 123, chunks: 4\n[/ATTACHED_FILES]'
      const result = extractFilesFromPrompt(block)

      expect(result.files).toHaveLength(1)
      expect(result.files[0].size).toBe(123)
      expect(result.files[0].chunkCount).toBe(4)
      expect(typeof result.files[0].size).toBe('number')
      expect(typeof result.files[0].chunkCount).toBe('number')
    })

    it('returns no files and unchanged prompt if end marker is missing', () => {
      const prompt = 'Prompt\n\n[ATTACHED_FILES]\n- file_id: 1, name: a.txt'
      const result = extractFilesFromPrompt(prompt)

      expect(result.files).toEqual([])
      expect(result.cleanPrompt).toBe(prompt)
    })

    it('returns no files and unchanged prompt if end marker is before start marker', () => {
      const prompt = '[/ATTACHED_FILES]\n[ATTACHED_FILES]\n- file_id: 1, name: a.txt'
      const result = extractFilesFromPrompt(prompt)

      expect(result.files).toEqual([])
      expect(result.cleanPrompt).toBe(prompt)
    })

    it('ignores invalid lines or files without id and name', () => {
      const block = 'Prompt\n\n[ATTACHED_FILES]\n- invalid line format\n- file_id: 1\n- name: a.txt\n- file_id: 2, name: valid.txt\n[/ATTACHED_FILES]'
      const result = extractFilesFromPrompt(block)

      expect(result.files).toHaveLength(1)
      expect(result.files[0]).toEqual({ id: '2', name: 'valid.txt' })
    })

    it('ignores non-numeric sizes or chunks and invalid injection modes', () => {
      const block = 'Prompt\n\n[ATTACHED_FILES]\n- file_id: 1, name: a, size: invalid, chunks: NaN, mode: magic\n[/ATTACHED_FILES]'
      const result = extractFilesFromPrompt(block)

      expect(result.files).toHaveLength(1)
      expect(result.files[0].id).toBe('1')
      expect(result.files[0].name).toBe('a')
      expect(result.files[0].size).toBeUndefined()
      expect(result.files[0].chunkCount).toBeUndefined()
      expect(result.files[0].injectionMode).toBeUndefined()
    })
  })
})
