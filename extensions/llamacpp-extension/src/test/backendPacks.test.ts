import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  listInstalledBackendPacks,
  deleteBackendPack,
  fetchStableIndex,
  invalidateStableIndexCache,
  getIndexedAssetName,
  TURBOQUANT_RELEASE_INDEX_URL,
  TURBOQUANT_LATEST_RELEASE_URL,
  TURBOQUANT_LEGACY_MANIFEST_URL,
} from '../backend'
import { getSystemInfo } from '../hardware'
import { getProxyConfig } from '../util'
import { getVersion } from '@tauri-apps/api/app'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { fs, getJanDataFolderPath } from '@janhq/core'
import {
  determineSupportedBackends,
  getSupportedFeaturesFromRust,
  getLocalInstalledBackendsInternal,
} from '../../../../src-tauri/plugins/tauri-plugin-llamacpp/guest-js/index'

vi.mock('@janhq/core', () => ({
  getJanDataFolderPath: vi.fn(),
  fs: {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    rm: vi.fn(),
  },
  joinPath: vi.fn(async (paths: string[]) => paths.join('/')),
  events: { emit: vi.fn() },
}))
vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn() }))
vi.mock('../hardware', () => ({ getSystemInfo: vi.fn() }))
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('../util', () => ({ getProxyConfig: vi.fn() }))
vi.mock(
  '../../../../src-tauri/plugins/tauri-plugin-llamacpp/guest-js/index',
  async () => {
    const actual = await vi.importActual<
      typeof import('../../../../src-tauri/plugins/tauri-plugin-llamacpp/guest-js/index')
    >('../../../../src-tauri/plugins/tauri-plugin-llamacpp/guest-js/index')
    return {
      ...actual,
      determineSupportedBackends: vi.fn(),
      getSupportedFeaturesFromRust: vi.fn(),
      normalizeFeatures: vi.fn((features) => features),
      getLocalInstalledBackendsInternal: vi.fn(),
    }
  }
)

vi.stubGlobal('IS_WINDOWS', false)

const ROOT = '/data'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getJanDataFolderPath).mockResolvedValue(ROOT)
})

describe('listInstalledBackendPacks', () => {
  it('returns every installed build with its path and flags only the selected one active', async () => {
    vi.mocked(getLocalInstalledBackendsInternal).mockResolvedValue([
      { version: 'b1-1.0.0', backend: 'linux-x64-vulkan' },
      // Settings files written on Windows can carry a BOM and stray spaces.
      { version: '\uFEFFb2-1.1.0 ', backend: ' linux-x64-cpu' },
    ] as any)

    const packs = await listInstalledBackendPacks(
      'llamacpp',
      ' b2-1.1.0/linux-x64-cpu\uFEFF'
    )

    expect(getLocalInstalledBackendsInternal).toHaveBeenCalledWith(
      `${ROOT}/llamacpp/backends`
    )
    expect(packs).toEqual([
      {
        version: 'b1-1.0.0',
        backend: 'linux-x64-vulkan',
        path: `${ROOT}/llamacpp/backends/b1-1.0.0/linux-x64-vulkan`,
        active: false,
      },
      {
        version: 'b2-1.1.0',
        backend: 'linux-x64-cpu',
        path: `${ROOT}/llamacpp/backends/b2-1.1.0/linux-x64-cpu`,
        active: true,
      },
    ])
  })

  it('returns an empty list when nothing is installed', async () => {
    vi.mocked(getLocalInstalledBackendsInternal).mockResolvedValue([])
    await expect(listInstalledBackendPacks('llamacpp', '')).resolves.toEqual(
      []
    )
  })
})

describe('deleteBackendPack', () => {
  const versionDir = `${ROOT}/llamacpp/backends/b1-1.0.0`
  const backendDir = `${versionDir}/linux-x64-vulkan`

  it.each([
    ['', 'linux-x64-vulkan'],
    ['b1-1.0.0', '  '],
  ])('rejects a blank version or backend (%j/%j)', async (version, backend) => {
    await expect(
      deleteBackendPack('llamacpp', 'b9/x', version, backend)
    ).rejects.toThrow('Invalid backend pack')
    expect(fs.rm).not.toHaveBeenCalled()
  })

  it.each([
    ['../b1', 'linux-x64-vulkan'],
    ['b1-1.0.0', '..\\..\\Windows'],
  ])(
    'rejects path separators so a pack cannot escape the backends dir (%j/%j)',
    async (version, backend) => {
      await expect(
        deleteBackendPack('llamacpp', 'b9/x', version, backend)
      ).rejects.toThrow('Invalid backend pack')
      expect(fs.rm).not.toHaveBeenCalled()
    }
  )

  it('refuses to delete the currently selected build', async () => {
    await expect(
      deleteBackendPack(
        'llamacpp',
        'b1-1.0.0/linux-x64-vulkan',
        'b1-1.0.0',
        'linux-x64-vulkan'
      )
    ).rejects.toThrow('currently selected')
    expect(fs.rm).not.toHaveBeenCalled()
  })

  it('removes the build and the version dir it leaves empty', async () => {
    vi.mocked(fs.existsSync).mockResolvedValue(true)
    vi.mocked(fs.readdirSync).mockResolvedValue([])

    await deleteBackendPack(
      'llamacpp',
      'b2-1.1.0/linux-x64-cpu',
      'b1-1.0.0',
      'linux-x64-vulkan'
    )

    expect(fs.rm).toHaveBeenNthCalledWith(1, backendDir)
    expect(fs.rm).toHaveBeenNthCalledWith(2, versionDir)
  })

  it('keeps a version dir that still holds other builds', async () => {
    vi.mocked(fs.existsSync).mockResolvedValue(true)
    vi.mocked(fs.readdirSync).mockResolvedValue(['linux-x64-cpu'])

    await deleteBackendPack('llamacpp', '', 'b1-1.0.0', 'linux-x64-vulkan')

    expect(fs.rm).toHaveBeenCalledTimes(1)
    expect(fs.rm).toHaveBeenCalledWith(backendDir)
  })

  it('is a no-op when the build and its version dir are already gone', async () => {
    vi.mocked(fs.existsSync).mockResolvedValue(false)

    await deleteBackendPack('llamacpp', '', 'b1-1.0.0', 'linux-x64-vulkan')

    expect(fs.readdirSync).not.toHaveBeenCalled()
    expect(fs.rm).not.toHaveBeenCalled()
  })
})

describe('fetchStableIndex transports and source fallbacks', () => {
  const LATEST = 'b10269-1.4.0'
  const json = (body: unknown, url = '') =>
    ({ ok: true, status: 200, url, json: async () => body }) as Response
  const status = (code: number) =>
    ({ ok: false, status: code, url: '', json: async () => ({}) }) as Response

  const route = (
    handlers: Record<string, () => Response | Promise<Response>>
  ) => {
    const impl = async (url: string) => {
      const handler = handlers[url]
      if (!handler) throw new Error(`unrouted ${url}`)
      return handler()
    }
    vi.mocked(globalThis.fetch).mockImplementation(impl as any)
    vi.mocked(tauriFetch).mockImplementation(impl as any)
  }

  beforeEach(() => {
    invalidateStableIndexCache()
    vi.stubGlobal('fetch', vi.fn())
    vi.mocked(getVersion).mockResolvedValue('1.0.0')
    vi.mocked(fs.existsSync).mockResolvedValue(false)
    vi.mocked(getSupportedFeaturesFromRust).mockResolvedValue({} as any)
    vi.mocked(getSystemInfo).mockResolvedValue({
      os_type: 'linux',
      cpu: { arch: 'x86_64', extensions: [] },
      gpus: [],
    } as any)
    vi.mocked(determineSupportedBackends).mockResolvedValue([
      'linux-x64-vulkan',
    ])
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.stubGlobal('IS_WINDOWS', false)
    invalidateStableIndexCache()
  })

  const proxyAwareCall = () =>
    vi
      .mocked(tauriFetch)
      .mock.calls.find(([, init]) => (init as any)?.proxy !== undefined)

  it('passes the full stored proxy config to the proxy-aware transport only', async () => {
    vi.mocked(getProxyConfig).mockReturnValue({
      url: 'http://proxy.lan:3128',
      username: 'u',
      password: 'p',
      no_proxy: ['localhost', '127.0.0.1'],
      ignore_ssl: true,
    } as any)
    route({
      [TURBOQUANT_RELEASE_INDEX_URL]: () =>
        json({
          releases: [
            {
              tag: LATEST,
              variants: [{ id: 'linux-x64-vulkan', asset: 'a.tar.gz' }],
            },
          ],
        }),
    })

    await fetchStableIndex()

    expect(proxyAwareCall()?.[1]).toMatchObject({
      proxy: {
        all: {
          url: 'http://proxy.lan:3128',
          basicAuth: { username: 'u', password: 'p' },
          noProxy: 'localhost,127.0.0.1',
        },
      },
      danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
    })
    // The direct fallback must bypass the proxy entirely.
    expect(
      vi
        .mocked(tauriFetch)
        .mock.calls.some(([, init]) => (init as any)?.proxy === undefined)
    ).toBe(true)
  })

  it('omits credentials, no_proxy and TLS overrides the user did not set', async () => {
    vi.mocked(getProxyConfig).mockReturnValue({
      url: 'http://proxy.lan:3128',
      username: 'only-user',
      no_proxy: [],
      ignore_ssl: false,
    } as any)
    route({
      [TURBOQUANT_RELEASE_INDEX_URL]: () =>
        json({
          releases: [
            {
              tag: LATEST,
              variants: [{ id: 'linux-x64-vulkan', asset: 'a.tar.gz' }],
            },
          ],
        }),
    })

    await fetchStableIndex()

    const init = proxyAwareCall()?.[1] as any
    expect(init.proxy).toEqual({ all: { url: 'http://proxy.lan:3128' } })
    expect(init.danger).toBeUndefined()
  })

  it.each([[undefined], [{ url: '' }], [{ url: 42 }]])(
    'sends no proxy options when no usable proxy is stored (%j)',
    async (cfg) => {
      vi.mocked(getProxyConfig).mockReturnValue(cfg as any)
      route({
        [TURBOQUANT_RELEASE_INDEX_URL]: () =>
          json({
            releases: [
              {
                tag: LATEST,
                variants: [{ id: 'linux-x64-vulkan', asset: 'a.tar.gz' }],
              },
            ],
          }),
      })

      await fetchStableIndex()

      expect(proxyAwareCall()).toBeUndefined()
    }
  )

  it('falls back to the legacy manifest when the index is missing and the redirect has no tag', async () => {
    route({
      [TURBOQUANT_RELEASE_INDEX_URL]: () => status(404),
      // A redirect that never reached /releases/tag/<tag>.
      [TURBOQUANT_LATEST_RELEASE_URL]: () =>
        ({ ok: true, status: 200, url: undefined }) as unknown as Response,
      [TURBOQUANT_LEGACY_MANIFEST_URL]: () =>
        json({
          backends: [
            null,
            { id: 7, tag: LATEST },
            { id: 'linux-x64-vulkan', tag: 'dev-latest', asset: 'x' },
            {
              id: ' linux-x64-vulkan ',
              tag: LATEST,
              asset: 'legacy-vulkan.tar.gz',
            },
          ],
        }),
    })

    const catalog = await fetchStableIndex()

    expect(catalog.source).toBe('legacy-manifest')
    expect(catalog.releases).toEqual([
      {
        tag: LATEST,
        prerelease: false,
        commit: undefined,
        variants: [{ id: 'linux-x64-vulkan', asset: 'legacy-vulkan.tar.gz' }],
      },
    ])
    expect(getIndexedAssetName(LATEST, 'linux-x64-vulkan')).toBe(
      'legacy-vulkan.tar.gz'
    )
  })

  it('treats an index without a releases array as absent and uses the redirect', async () => {
    route({
      [TURBOQUANT_RELEASE_INDEX_URL]: () => json({ schema_version: 1 }),
      [TURBOQUANT_LATEST_RELEASE_URL]: () =>
        json(
          {},
          `https://github.com/x/y/releases/tag/${encodeURIComponent(LATEST)}`
        ),
    })

    const catalog = await fetchStableIndex()

    expect(catalog.source).toBe('redirect')
    expect(catalog.latest).toBe(LATEST)
  })

  it('serves an empty catalog when every source is unusable and nothing is cached', async () => {
    route({
      [TURBOQUANT_RELEASE_INDEX_URL]: () => json({ releases: [] }),
      [TURBOQUANT_LATEST_RELEASE_URL]: () =>
        json({}, 'https://github.com/x/y/releases/tag/dev-latest'),
      [TURBOQUANT_LEGACY_MANIFEST_URL]: () => status(500),
    })

    const catalog = await fetchStableIndex()

    expect(catalog.releases).toEqual([])
    expect(getIndexedAssetName(LATEST, 'linux-x64-vulkan')).toBeUndefined()
  })

  it('reports every transport failure, including non-Error rejections', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue('webview blocked')
    vi.mocked(tauriFetch).mockRejectedValue(new Error('proxy refused'))

    const catalog = await fetchStableIndex()

    expect(catalog.releases).toEqual([])
    const warnings = vi
      .mocked(console.warn)
      .mock.calls.map((args) => String(args[1] ?? args[0]))
    expect(warnings.some((w) => w.includes('webview fetch: webview blocked'))).toBe(
      true
    )
  })

  it('shares one in-flight resolution between concurrent callers', async () => {
    route({
      [TURBOQUANT_RELEASE_INDEX_URL]: () =>
        json({
          releases: [
            {
              tag: LATEST,
              variants: [{ id: 'linux-x64-vulkan', asset: 'a.tar.gz' }],
            },
          ],
        }),
    })

    const [a, b] = await Promise.all([fetchStableIndex(), fetchStableIndex()])

    expect(a).toBe(b)
    expect(vi.mocked(getVersion)).toHaveBeenCalledTimes(1)
  })
})
