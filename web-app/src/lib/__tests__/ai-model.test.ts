import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createLanguageModel } from '../ai-model'

const mockState = vi.hoisted(() => ({
  createOpenAICompatibleArgs: [] as any[],
  languageModelArgs: [] as any[],
  languageModelResult: { id: 'mocked-model' } as any,
  openAICompatibleCallModelId: '' as string,
  openAICompatibleResult: { id: 'mocked-compatible-model' } as any,
}))

vi.mock('@ai-sdk/openai-compatible', () => {
  const mockProviderFunction = (modelId: string) => {
    mockState.openAICompatibleCallModelId = modelId
    return mockState.openAICompatibleResult
  }
  mockProviderFunction.languageModel = (modelId: string, options: any) => {
    mockState.languageModelArgs.push({ modelId, options })
    return mockState.languageModelResult
  }
  return {
    createOpenAICompatible: (options: any) => {
      mockState.createOpenAICompatibleArgs.push(options)
      return mockProviderFunction
    },
  }
})

describe('createLanguageModel', () => {
  beforeEach(() => {
    mockState.createOpenAICompatibleArgs = []
    mockState.languageModelArgs = []
    mockState.openAICompatibleCallModelId = ''
  })

  it('throws an error if no provider configuration is given', () => {
    expect(() => createLanguageModel('test-model')).toThrow(
      'Provider configuration is required'
    )
  })

  describe('llamacpp provider branch', () => {
    it('initializes llamacpp with placeholder connection info', () => {
      const provider = { provider: 'llamacpp' } as any
      const providerObject = {} as any
      const result = createLanguageModel('test-model', provider, providerObject)

      expect(mockState.createOpenAICompatibleArgs.length).toBe(1)
      expect(mockState.createOpenAICompatibleArgs[0]).toStrictEqual({
        name: 'llamacpp',
        baseURL: 'http://localhost:1337/v1',
        headers: {
          Authorization: 'Bearer placeholder',
          Origin: 'tauri://localhost',
        },
        includeUsage: true,
      })

      expect(mockState.languageModelArgs.length).toBe(1)
      expect(mockState.languageModelArgs[0].modelId).toBe('test-model')
      expect(result).toBe(mockState.languageModelResult)
    })

    describe('llamaCppMetadataExtractor', () => {
      it('extractMetadata processes timings correctly', async () => {
        const provider = { provider: 'llamacpp' } as any
        const providerObject = {} as any
        createLanguageModel('test-model', provider, providerObject)

        const options = mockState.languageModelArgs[0].options
        const extractor = options.metadataExtractor

        const result = await extractor.extractMetadata({
          parsedBody: {
            timings: {
              prompt_n: 10,
              predicted_n: 20,
              predicted_per_second: 5,
              prompt_per_second: 15,
            },
          },
        })

        expect(result).toStrictEqual({
          llamacpp: {
            promptTokens: 10,
            completionTokens: 20,
            tokensPerSecond: 5,
            promptPerSecond: 15,
          },
        })
      })

      it('extractMetadata returns undefined for missing timings', async () => {
        const provider = { provider: 'llamacpp' } as any
        const providerObject = {} as any
        createLanguageModel('test-model', provider, providerObject)

        const options = mockState.languageModelArgs[0].options
        const extractor = options.metadataExtractor

        const result1 = await extractor.extractMetadata({
          parsedBody: { timings: undefined },
        })
        expect(result1).toBeUndefined()

        const result2 = await extractor.extractMetadata({
          parsedBody: {},
        })
        expect(result2).toBeUndefined()
      })

      it('createStreamExtractor processes chunks and builds metadata', () => {
        const provider = { provider: 'llamacpp' } as any
        const providerObject = {} as any
        createLanguageModel('test-model', provider, providerObject)

        const options = mockState.languageModelArgs[0].options
        const streamExtractor = options.metadataExtractor.createStreamExtractor()

        streamExtractor.processChunk({
          timings: {
            prompt_n: 10,
            predicted_n: 20,
            predicted_per_second: 5,
            prompt_per_second: 15,
          },
        })

        const result = streamExtractor.buildMetadata()
        expect(result).toStrictEqual({
          llamacpp: {
            promptTokens: 10,
            completionTokens: 20,
            tokensPerSecond: 5,
            promptPerSecond: 15,
          },
        })
      })

      it('createStreamExtractor returns undefined if no chunks processed', () => {
        const provider = { provider: 'llamacpp' } as any
        const providerObject = {} as any
        createLanguageModel('test-model', provider, providerObject)

        const options = mockState.languageModelArgs[0].options
        const streamExtractor = options.metadataExtractor.createStreamExtractor()

        const result = streamExtractor.buildMetadata()
        expect(result).toBeUndefined()
      })
    })
  })

  describe('remote providers branch', () => {
    it('initializes generic remote provider with apiKey and baseURL', () => {
      const provider = {
        provider: 'openai',
        api_key: 'test-key',
        base_url: 'https://api.openai.com/v1',
      } as any
      const result = createLanguageModel('test-model', provider, null)

      expect(mockState.createOpenAICompatibleArgs.length).toBe(1)
      expect(mockState.createOpenAICompatibleArgs[0]).toStrictEqual({
        name: 'openai',
        apiKey: 'test-key',
        baseURL: 'https://api.openai.com/v1',
        headers: {},
        includeUsage: true,
      })

      expect(mockState.openAICompatibleCallModelId).toBe('test-model')
      expect(result).toBe(mockState.openAICompatibleResult)
    })

    it('adds Origin header for localhost base_url', () => {
      const provider = {
        provider: 'local-provider',
        base_url: 'http://localhost:8080/v1',
      } as any
      createLanguageModel('test-model', provider, null)

      expect(mockState.createOpenAICompatibleArgs[0].headers).toStrictEqual({
        Origin: 'tauri://localhost',
      })
    })

    it('adds Origin header for 127.0.0.1 base_url', () => {
      const provider = {
        provider: 'local-provider',
        base_url: 'http://127.0.0.1:1234/v1',
      } as any
      createLanguageModel('test-model', provider, null)

      expect(mockState.createOpenAICompatibleArgs[0].headers).toStrictEqual({
        Origin: 'tauri://localhost',
      })
    })

    it('adds openrouter headers for openrouter provider', () => {
      const provider = {
        provider: 'openrouter',
        base_url: 'https://openrouter.ai/api/v1',
      } as any
      createLanguageModel('test-model', provider, null)

      expect(mockState.createOpenAICompatibleArgs[0].headers).toStrictEqual({
        'HTTP-Referer': 'https://jan.ai',
        'X-Title': 'Radium',
      })
    })

    it('defaults baseURL and does not add Origin header if base_url is omitted', () => {
      const provider = {
        provider: 'generic',
      } as any
      createLanguageModel('test-model', provider, null)

      expect(mockState.createOpenAICompatibleArgs[0].baseURL).toBe(
        'http://localhost:1337/v1'
      )
      expect(mockState.createOpenAICompatibleArgs[0].headers).toStrictEqual({})
    })
  })
})
