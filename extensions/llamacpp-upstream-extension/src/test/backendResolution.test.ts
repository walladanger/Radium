import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  BUNDLED_BASELINE_TAG,
  cleanupIncompleteBackends,
  fetchRemoteBackends,
  findCompatibleInstalledBackend,
  friendlyBackendLabel,
  getCudaToolkitVersion,
  getCudartArchiveName,
  getCudartDownloadUrl,
  listSupportedBackends,
  resolveBackendArchiveSource,
} from '../backend'
import { BUNDLED_MANIFEST_BASELINE } from '../bundledManifestBaseline'
import { getSystemInfo } from '../hardware'
import { getProxyConfig } from '../util'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { fs, getJanDataFolderPath } from '@janhq/core'
import {
  determineSupportedBackends,
  fetchManifestHttp1,
  getLocalInstalledBackendsInternal,
  getSupportedFeaturesFromRust,
  listSupportedBackendsFromRust,
  mapOldBackendToNew,
} from '../../../../src-tauri/plugins/tauri-plugin-llamacpp-upstream/guest-js/index'

vi.mock('@janhq/core', () => ({
  getJanDataFolderPath: vi.fn(),
  fs: { existsSync: vi.fn(), readdirSync: vi.fn(), rm: vi.fn() },
  joinPath: vi.fn(async (paths: string[]) => paths.join('/')),
  events: { emit: vi.fn() },
}))
vi.mock('../hardware', () => ({ getSystemInfo: vi.fn() }))
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('../util', () => ({ getProxyConfig: vi.fn() }))
vi.mock(
  '../../../../src-tauri/plugins/tauri-plugin-llamacpp-upstream/guest-js/index',
  async () => {
    const actual = await vi.importActual<
      typeof import('../../../../src-tauri/plugins/tauri-plugin-llamacpp-upstream/guest-js/index')
    >(
      '../../../../src-tauri/plugins/tauri-plugin-llamacpp-upstream/guest-js/index'
    )
    return {
      ...actual,
      getLocalInstalledBackendsInternal: vi.fn(),
      determineSupportedBackends: vi.fn(),
      getSupportedFeaturesFromRust: vi.fn(),
      normalizeFeatures: vi.fn((features) => features),
      listSupportedBackendsFromRust: vi.fn(),
      mapOldBackendToNew: vi.fn(),
      fetchManifestHttp1: vi.fn(),
    }
  }
)

vi.stubGlobal('IS_WINDOWS', false)

const ROOT = '/data'
const BACKENDS = `${ROOT}/llamacpp-upstream/backends`
const TAG = 'b20000'
const MIRROR = 'https://mirror.example/releases/download'
const GGML = 'https://github.com/ggml-org/llama.cpp/releases/download'

type Manifest = {
  tag_name?: string
  download_base?: string
  assets?: Array<{ name: string; sha256?: string; size?: number }>
}

/** Every manifest transport (webview, two plugin-http, Rust HTTP/1.1) answers alike. */
function serveManifest(manifest: Manifest | null, status = 200) {
  const respond = async () => {
    if (manifest === null) throw new Error('offline')
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => manifest,
    } as Response
  }
  vi.mocked(globalThis.fetch).mockImplementation(respond as any)
  vi.mocked(tauriFetch).mockImplementation(respond as any)
  vi.mocked(fetchManifestHttp1).mockImplementation(async () => {
    if (manifest === null) throw new Error('offline')
    if (status !== 200) throw new Error(`HTTP ${status}`)
    return JSON.stringify(manifest)
  })
}

function host(os_type: string, arch = 'x86_64') {
  vi.mocked(getSystemInfo).mockResolvedValue({
    os_type,
    cpu: { arch, extensions: [] },
    gpus: [],
  } as any)
}

const asset = (backend: string, ext: string) => ({
  name: `llama-${TAG}-bin-${backend}.${ext}`,
  sha256: 'ab'.repeat(32),
  size: 1234,
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', vi.fn())
  vi.mocked(getJanDataFolderPath).mockResolvedValue(ROOT)
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  host('linux')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.stubGlobal('IS_WINDOWS', false)
})

describe('findCompatibleInstalledBackend', () => {
  it.each([
    ['linux-vulkan-x64', 'ubuntu-vulkan-x64'],
    ['linux-vulkan-arm64', 'ubuntu-vulkan-arm64'],
    ['linux-cpu-x64', 'ubuntu-x64'],
    ['linux-cpu-arm64', 'ubuntu-arm64'],
    ['ubuntu-vulkan-x64', 'linux-vulkan-x64'],
    ['ubuntu-vulkan-arm64', 'linux-vulkan-arm64'],
    ['ubuntu-x64', 'linux-cpu-x64'],
    ['ubuntu-arm64', 'linux-cpu-arm64'],
  ])(
    'treats an on-disk %s and %s as the same backend type',
    async (wanted, onDisk) => {
      vi.mocked(getLocalInstalledBackendsInternal).mockResolvedValue([
        { version: 'b1', backend: 'macos-arm64', order: 9 },
        { version: 'b1', backend: onDisk, order: 1 },
      ] as any)

      await expect(findCompatibleInstalledBackend(wanted)).resolves.toEqual({
        version: 'b1',
        backend: onDisk,
        order: 1,
      })
      expect(getLocalInstalledBackendsInternal).toHaveBeenCalledWith(BACKENDS)
    }
  )

  it('picks the newest install of the type, treating a missing order as oldest', async () => {
    vi.mocked(getLocalInstalledBackendsInternal).mockResolvedValue([
      { version: 'b1', backend: 'win-cpu-x64' },
      { version: 'b3', backend: '\uFEFFwin-cpu-x64', order: 3 },
      { version: 'b2', backend: 'win-cpu-x64', order: 2 },
      { version: 'b0', backend: 'win-cpu-x64' },
    ] as any)

    const found = await findCompatibleInstalledBackend('win-cpu-x64')
    expect(found?.version).toBe('b3')
  })

  it('never crosses backend types', async () => {
    vi.mocked(getLocalInstalledBackendsInternal).mockResolvedValue([
      { version: 'b1', backend: 'win-cpu-x64', order: 1 },
    ] as any)

    await expect(
      findCompatibleInstalledBackend('win-cuda-13.3-x64')
    ).resolves.toBeNull()
  })
})

describe('cleanupIncompleteBackends', () => {
  it('does nothing when the backends tree does not exist', async () => {
    vi.mocked(fs.existsSync).mockResolvedValue(false)

    await expect(cleanupIncompleteBackends()).resolves.toEqual([])
    expect(fs.readdirSync).not.toHaveBeenCalled()
    expect(fs.rm).not.toHaveBeenCalled()
  })

  it('removes builds without a server binary, skips stray files and drops emptied version dirs', async () => {
    const present = new Set([
      BACKENDS,
      // A complete build: build/ exists and holds the binary.
      `${BACKENDS}/b2/linux-cpu-x64/build`,
      `${BACKENDS}/b2/linux-cpu-x64/build/bin/llama-server`,
    ])
    vi.mocked(fs.existsSync).mockImplementation(async (p: string) =>
      present.has(p)
    )
    const tree: Record<string, string[]> = {
      [BACKENDS]: ['b1', 'b2', 'stray.txt'],
      [`${BACKENDS}/b1`]: ['linux-vulkan-x64'],
      [`${BACKENDS}/b2`]: ['linux-cpu-x64', 'linux-vulkan-x64'],
    }
    const removedPaths = new Set<string>()
    vi.mocked(fs.rm).mockImplementation(async (p: string) => {
      removedPaths.add(p)
    })
    vi.mocked(fs.readdirSync).mockImplementation(async (p: string) => {
      const entries = tree[p]
      if (!entries) throw new Error('ENOTDIR')
      return entries.filter((e) => !removedPaths.has(`${p}/${e}`))
    })

    await expect(cleanupIncompleteBackends()).resolves.toEqual([
      'b1/linux-vulkan-x64',
      'b2/linux-vulkan-x64',
    ])
    expect([...removedPaths]).toEqual([
      `${BACKENDS}/b1/linux-vulkan-x64`,
      `${BACKENDS}/b1`,
      `${BACKENDS}/b2/linux-vulkan-x64`,
    ])
  })
})

describe('resolveBackendArchiveSource', () => {
  const vulkan = 'linux-vulkan-x64'
  const archive = `llama-${TAG}-bin-ubuntu-vulkan-x64.tar.gz`

  it('downloads a mirrored, hashed asset from the signed mirror', async () => {
    serveManifest({
      tag_name: TAG,
      download_base: MIRROR,
      assets: [asset('ubuntu-vulkan-x64', 'tar.gz')],
    })
    await fetchRemoteBackends({ force: true })

    await expect(resolveBackendArchiveSource(TAG, vulkan)).resolves.toEqual({
      url: `${MIRROR}/${TAG}/${archive}`,
      sha256: 'ab'.repeat(32),
      size: 1234,
    })
  })

  it.each([
    ['another tag', { tag_name: 'b19999', download_base: MIRROR, assets: [] }],
    ['no mirror', { tag_name: TAG, assets: [asset('ubuntu-vulkan-x64', 'tar.gz')] }],
    ['no assets list', { tag_name: TAG, download_base: MIRROR }],
    [
      'an unhashed asset',
      {
        tag_name: TAG,
        download_base: MIRROR,
        assets: [{ name: archive, size: 5 }],
      },
    ],
    [
      'an asset without size',
      {
        tag_name: TAG,
        download_base: MIRROR,
        assets: [{ name: archive, sha256: 'cd' }],
      },
    ],
  ])('falls back to the ggml-org CDN without a hash for %s', async (_, m) => {
    serveManifest(m as Manifest)
    await fetchRemoteBackends({ force: true })

    await expect(
      resolveBackendArchiveSource(`\uFEFF${TAG} `, vulkan)
    ).resolves.toEqual({ url: `${GGML}/${TAG}/${archive}` })
  })

  it('fetches the manifest itself when none is cached, and falls back when it is unreachable', async () => {
    serveManifest(null)
    await fetchRemoteBackends({ force: true })

    await expect(resolveBackendArchiveSource(TAG, vulkan)).resolves.toEqual({
      url: `${GGML}/${TAG}/${archive}`,
    })
    const warned = vi.mocked(console.warn).mock.calls.flat().join(' ')
    expect(warned).toContain('webview fetch: offline')
  })
})

describe('fetchRemoteBackends manifest parsing', () => {
  it('offers nothing on an unknown OS', async () => {
    host('freebsd')
    await expect(fetchRemoteBackends({ force: true })).resolves.toEqual([])
    expect(tauriFetch).not.toHaveBeenCalled()
  })

  it('keeps only allowed Windows builds for the host architecture', async () => {
    host('windows')
    serveManifest({
      tag_name: TAG,
      assets: [
        asset('win-cpu-x64', 'zip'),
        asset('win-cuda-12.4-x64', 'zip'),
        asset('win-cuda-13.3-x64', 'zip'),
        asset('win-rocm-7.14-x64', 'zip'),
        asset('win-vulkan-x64', 'zip'),
        asset('win-cpu-arm64', 'zip'),
        asset('win-sycl-x64', 'zip'),
        { name: 'cudart-llama-bin-win-cuda-13.3-x64.zip' },
      ],
    })

    const backends = await fetchRemoteBackends({ force: true })
    expect(backends.map((b) => b.backend)).toEqual([
      'win-cpu-x64',
      'win-cuda-12.4-x64',
      'win-cuda-13.3-x64',
      'win-rocm-7.14-x64',
      'win-vulkan-x64',
    ])
  })

  it('offers no runtime Linux builds on arm64', async () => {
    host('linux', 'aarch64')
    serveManifest({ tag_name: TAG, assets: [asset('ubuntu-x64', 'tar.gz')] })
    await expect(fetchRemoteBackends({ force: true })).resolves.toEqual([])
  })

  it('maps ubuntu assets to internal Linux ids and ignores unknown ones', async () => {
    serveManifest({
      tag_name: TAG,
      assets: [
        asset('ubuntu-x64', 'tar.gz'),
        asset('ubuntu-vulkan-x64', 'tar.gz'),
        asset('ubuntu-s390x', 'tar.gz'),
      ],
    })
    const backends = await fetchRemoteBackends({ force: true })
    expect(backends.map((b) => b.backend).sort()).toEqual([
      'linux-cpu-x64',
      'linux-vulkan-x64',
    ])
  })

  it('serves the session cache until forced', async () => {
    serveManifest({ tag_name: TAG, assets: [asset('ubuntu-x64', 'tar.gz')] })
    await fetchRemoteBackends({ force: true })
    serveManifest({ tag_name: 'b30000', assets: [] })

    const cached = await fetchRemoteBackends()
    expect(cached).toEqual([
      { version: TAG, backend: 'linux-cpu-x64', order: 0 },
    ])
  })

  it.each([
    ['a manifest without tag_name', { assets: [] } as Manifest, 200],
    ['an HTTP error', { tag_name: TAG } as Manifest, 503],
  ])('falls back to the bundled baseline on %s', async (_, m, status) => {
    host('macos', 'aarch64')
    serveManifest(m, status)

    const backends = await fetchRemoteBackends({ force: true })
    expect(backends.every((b) => b.version === BUNDLED_BASELINE_TAG)).toBe(
      true
    )
    expect(backends.length).toBe(
      BUNDLED_MANIFEST_BASELINE.assets.filter((a) =>
        a.name.endsWith('-bin-macos-arm64.tar.gz')
      ).length
    )
  })

  it('reports non-Error transport failures verbatim', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue('blocked')
    vi.mocked(tauriFetch).mockRejectedValue('refused')
    vi.mocked(fetchManifestHttp1).mockRejectedValue('h1 stall')

    await fetchRemoteBackends({ force: true })

    const warned = vi.mocked(console.warn).mock.calls.flat().join(' ')
    expect(warned).toContain('blocked')
    expect(warned).toContain('h1 stall')
  })
})

describe('proxy options for the proxy-aware manifest transport', () => {
  const proxyCall = () =>
    vi
      .mocked(tauriFetch)
      .mock.calls.find(([, init]) => (init as any)?.proxy !== undefined)

  it('forwards credentials, no_proxy and the TLS opt-out', async () => {
    vi.mocked(getProxyConfig).mockReturnValue({
      url: 'http://proxy:8080',
      username: 'u',
      password: 'p',
      no_proxy: ['localhost'],
      ignore_ssl: true,
    } as any)
    serveManifest({ tag_name: TAG, assets: [] })

    await fetchRemoteBackends({ force: true })

    expect(proxyCall()?.[1]).toMatchObject({
      proxy: {
        all: {
          url: 'http://proxy:8080',
          basicAuth: { username: 'u', password: 'p' },
          noProxy: 'localhost',
        },
      },
      danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true },
    })
  })

  it('sends only the proxy URL when nothing else is configured', async () => {
    vi.mocked(getProxyConfig).mockReturnValue({
      url: 'http://proxy:8080',
      password: 'p',
      no_proxy: [],
    } as any)
    serveManifest({ tag_name: TAG, assets: [] })

    await fetchRemoteBackends({ force: true })

    const init = proxyCall()?.[1] as any
    expect(init.proxy).toEqual({ all: { url: 'http://proxy:8080' } })
    expect(init.danger).toBeUndefined()
  })

  it.each([[undefined], [{ url: '' }], [{ url: 8080 }]])(
    'adds no proxy when none is usable (%j)',
    async (cfg) => {
      vi.mocked(getProxyConfig).mockReturnValue(cfg as any)
      serveManifest({ tag_name: TAG, assets: [] })

      await fetchRemoteBackends({ force: true })

      expect(proxyCall()).toBeUndefined()
    }
  )
})

describe('Windows CUDA companion archives', () => {
  it.each([
    ['win-cuda-12.4-x64', '12.4'],
    ['\uFEFFwin-cuda-13.3-x64 ', '13.3'],
  ])('resolves the cudart companion for %j', (backend, toolkit) => {
    const name = `cudart-llama-bin-win-cuda-${toolkit}-x64.zip`
    expect(getCudaToolkitVersion(backend)).toBe(toolkit)
    expect(getCudartArchiveName(backend)).toBe(name)
    expect(getCudartDownloadUrl(` ${TAG}`, backend)).toBe(
      `${GGML}/${TAG}/${name}`
    )
  })

  it.each(['win-cpu-x64', 'win-cuda-11.7-x64', 'linux-cuda-12.4-x64'])(
    'has no companion for %s',
    (backend) => {
      expect(getCudaToolkitVersion(backend)).toBeNull()
      expect(getCudartArchiveName(backend)).toBeNull()
      expect(getCudartDownloadUrl(TAG, backend)).toBeNull()
    }
  )
})

describe('friendlyBackendLabel', () => {
  it.each([
    ['win-cpu-x64', 'CPU'],
    ['win-cuda-13.3-x64', 'CUDA 13'],
    ['win-cuda-12.4-x64', 'CUDA 12'],
    ['macos-arm64', 'Apple Silicon'],
    ['macos-x64', 'Intel'],
    ['win-sycl-x64', 'win-sycl-x64'],
  ])('labels %s as %s', (id, label) => {
    expect(friendlyBackendLabel(id)).toBe(label)
  })
})

describe('listSupportedBackends hardware gating', () => {
  const merged = [
    { version: TAG, backend: 'win-cpu-x64' },
    { version: TAG, backend: 'win-cuda-13.4-x64' },
    { version: TAG, backend: 'win-cuda-12.4-x64' },
    { version: TAG, backend: 'win-rocm-7.14-x64' },
    { version: TAG, backend: 'win-vulkan-x64' },
  ]

  beforeEach(() => {
    serveManifest({ tag_name: TAG, assets: [] })
    vi.mocked(getSupportedFeaturesFromRust).mockResolvedValue({} as any)
    vi.mocked(getLocalInstalledBackendsInternal).mockResolvedValue([])
    vi.mocked(listSupportedBackendsFromRust).mockResolvedValue(merged as any)
    vi.mocked(mapOldBackendToNew).mockImplementation(async (b: string) => b)
  })

  it('passes the merged list through unfiltered off Windows', async () => {
    host('linux')
    vi.mocked(determineSupportedBackends).mockResolvedValue([])

    await expect(listSupportedBackends({ force: true })).resolves.toEqual(
      merged
    )
  })

  it('on Windows matches concrete CUDA 13 and ROCm assets by family and drops unsupported ones', async () => {
    host('windows')
    vi.mocked(determineSupportedBackends).mockResolvedValue([
      'win-cpu-x64',
      'win-cuda-13-x64',
      'win-rocm-x64',
    ])

    const result = await listSupportedBackends({ force: true })
    expect(result.map((b) => b.backend)).toEqual([
      'win-cpu-x64',
      'win-cuda-13.4-x64',
      'win-rocm-7.14-x64',
    ])
  })

  it('on Windows hides GPU families the hardware does not support', async () => {
    host('windows')
    vi.mocked(determineSupportedBackends).mockResolvedValue(['win-cpu-x64'])

    const result = await listSupportedBackends({ force: true })
    expect(result.map((b) => b.backend)).toEqual(['win-cpu-x64'])
  })
})
