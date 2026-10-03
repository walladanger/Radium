/**
 * Tests for Radium's own built-in panels.
 *
 * One rule runs through all of them, and it is the reason this file is longer
 * than the panels: **a measurement that has not arrived must render as a dash,
 * never as a zero.** A CPU meter at `0%`, a download at `0 B/s` or a model at
 * `0 tok/s` are all claims about the machine that the panel cannot support
 * before its first sample. So every panel gets three cases — loading, empty,
 * and unavailable-reads-as-a-dash — plus one populated case to prove the dash
 * is not simply what it always prints.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NOT_AVAILABLE } from '../Readout'
import { useAppState } from '@/hooks/useAppState'
import { useDownloadStore } from '@/hooks/useDownloadStore'
import { useHardware } from '@/hooks/useHardware'
import { useLocalApiServer } from '@/hooks/useLocalApiServer'
import { useMCPServers } from '@/hooks/useMCPServers'
import { useMessages } from '@/hooks/useMessages'
import { useModelProvider } from '@/hooks/useModelProvider'

import { panel as hardwarePanel } from '../builtin/hardware'
import { panel as mcpPanel } from '../builtin/mcp'
import { panel as modelsPanel } from '../builtin/models'
import { panel as apiServerPanel } from '../builtin/api-server'
import { panel as downloadsPanel } from '../builtin/downloads'
import { panel as skillsPanel } from '../builtin/skills'

const statuses = vi.hoisted(() => ({
  value: [] as { name: string; status: 'connected' | 'error'; error?: string }[],
}))
const skillsHook = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
  /** Set by a test that needs the hook to hold real state across a render. */
  impl: null as null | (() => Record<string, unknown>),
}))

vi.mock('@/hooks/useServiceHub', () => {
  const hub = () => ({
    mcp: () => ({ getMCPServerStatuses: async () => statuses.value }),
    // `useMCPServerStatuses` subscribes to backend events for live refreshes;
    // the detacher it expects back is a no-op here.
    events: () => ({ listen: async () => () => {} }),
  })
  return { useServiceHub: hub, getServiceHub: hub }
})

vi.mock('@/hooks/useAgentSkills', () => ({
  useAgentSkills: () => (skillsHook.impl ? skillsHook.impl() : skillsHook.value),
}))

/** The text a `Readout` printed for one label. */
function readout(label: string): string {
  const row = screen.getByText(label).parentElement
  return (row?.textContent ?? '').replace(label, '').trim()
}

const cpu = {
  arch: 'x86_64',
  core_count: 16,
  extensions: [],
  name: 'Ryzen 9 5950X',
  usage: 0,
}

beforeEach(() => {
  statuses.value = []
  skillsHook.impl = null
  useHardware.setState({
    hardwareReady: false,
    hardwareData: {
      cpu: { arch: '', core_count: 0, extensions: [], name: '', usage: 0 },
      gpus: [],
      os_type: '',
      os_name: '',
      total_memory: 0,
    },
    systemUsage: { cpu: 0, used_memory: 0, total_memory: 0, gpus: [] },
  })
  useMCPServers.setState({ mcpServers: {}, loading: false })
  useAppState.setState({
    tools: [],
    activeModels: [],
    loadingModel: false,
    tokenSpeed: undefined,
    serverStatus: 'stopped',
  })
  useModelProvider.setState({ providers: [] })
  useLocalApiServer.setState({
    serverHost: '127.0.0.1',
    serverPort: 1337,
    apiPrefix: '/v1',
    corsEnabled: true,
    trustedHosts: [],
    proxyTimeout: 600,
    apiKey: '',
    enableOnStartup: false,
    lastServerModels: [],
  })
  useDownloadStore.setState({ downloads: {}, pausedDownloads: new Set<string>() })
  useMessages.setState({ messages: {} })
  skillsHook.value = {
    skills: [],
    loading: false,
    error: null,
    load: vi.fn(),
    setEnabled: vi.fn(async () => {}),
    approve: vi.fn(async () => {}),
  }
})

describe('the Hardware panel', () => {
  const Panel = hardwarePanel.component

  it('says it is loading before anything has been enumerated', () => {
    render(<Panel />)
    expect(screen.getByText('Loading…')).toBeTruthy()
  })

  it('reads an unsampled CPU as a dash, not as an idle machine', () => {
    // The hardware enumeration has landed — static facts are known — but no
    // usage sample has arrived yet. `0%` here would assert the machine is
    // idle, which is a different statement from "we have not measured".
    useHardware.setState({
      hardwareReady: true,
      hardwareData: {
        cpu,
        gpus: [],
        os_type: 'linux',
        os_name: 'Ubuntu',
        total_memory: 32 * 1024,
      },
    })
    render(<Panel />)

    expect(readout('Model')).toBe('Ryzen 9 5950X')
    expect(readout('Cores')).toBe('16')
    expect(readout('Usage')).toBe(NOT_AVAILABLE)
    expect(readout('Usage')).not.toContain('0%')
    // Total memory is a static fact and is known; what is in use is not.
    expect(readout('Total')).toBe('32.00 GB')
    expect(readout('In use')).toBe(NOT_AVAILABLE)
    expect(readout('Free')).toBe(NOT_AVAILABLE)
  })

  it('prints live usage once a sample has arrived', () => {
    useHardware.setState({
      hardwareReady: true,
      hardwareData: {
        cpu,
        gpus: [],
        os_type: 'linux',
        os_name: 'Ubuntu',
        total_memory: 32 * 1024,
      },
      systemUsage: { cpu: 37.4, used_memory: 8 * 1024, total_memory: 32 * 1024, gpus: [] },
    })
    render(<Panel />)

    expect(readout('Usage')).toBe('37%')
    expect(readout('In use')).toBe('8.00 GB')
    expect(readout('Free')).toBe('24.00 GB')
  })

  it('distinguishes "no GPU" from "not asked yet"', () => {
    useHardware.setState({
      hardwareReady: true,
      hardwareData: { cpu, gpus: [], os_type: 'linux', os_name: 'Ubuntu', total_memory: 1024 },
    })
    const { unmount } = render(<Panel />)
    expect(screen.getByText('No discrete GPU detected.')).toBeTruthy()
    unmount()

    // Same empty list, but from the persisted copy rather than a fresh probe.
    useHardware.setState({ hardwareReady: false })
    render(<Panel />)
    expect(screen.getByText('Not enumerated this session.')).toBeTruthy()
  })

  it('shows a GPU without inventing its live VRAM figure', () => {
    useHardware.setState({
      hardwareReady: true,
      hardwareData: {
        cpu,
        gpus: [
          {
            name: 'RTX 4090',
            total_memory: 24 * 1024,
            vendor: 'NVIDIA',
            uuid: 'gpu-0',
            driver_version: '550.54',
            nvidia_info: { index: 0, compute_capability: '8.9' },
            vulkan_info: { index: 0, device_id: 1, device_type: 'discrete', api_version: '1.3' },
          },
        ],
        os_type: 'linux',
        os_name: 'Ubuntu',
        total_memory: 32 * 1024,
      },
    })
    render(<Panel />)

    expect(readout('VRAM')).toBe('24.00 GB')
    expect(readout('VRAM in use')).toBe(NOT_AVAILABLE)
  })
})

describe('the MCP servers panel', () => {
  const Panel = mcpPanel.component

  it('says where to add one when none is configured', () => {
    render(<Panel />)
    expect(screen.getByText(/No MCP servers configured/)).toBeTruthy()
  })

  it('shows a loading state while the config is being read', () => {
    useMCPServers.setState({ loading: true, mcpServers: {} })
    render(<Panel />)
    expect(screen.getByText('Loading…')).toBeTruthy()
  })

  it('reads an unknown tool snapshot as a dash, not as zero tools', async () => {
    statuses.value = [{ name: 'files', status: 'connected' }]
    useMCPServers.setState({
      mcpServers: { files: { command: 'npx', args: [], env: {} } },
    })
    render(<Panel />)

    await waitFor(() => expect(screen.getByText('connected')).toBeTruthy())
    // Connected, but the tool snapshot belongs to the chat path and has not
    // been fetched. "0" would say the server offers nothing.
    expect(readout('Tools')).toBe(NOT_AVAILABLE)
  })

  it('counts the tools a connected server actually offers', async () => {
    statuses.value = [{ name: 'files', status: 'connected' }]
    useMCPServers.setState({
      mcpServers: { files: { command: 'npx', args: [], env: {} } },
    })
    useAppState.setState({
      tools: [
        { name: 'read_file', description: '', inputSchema: {}, server: 'files' },
        { name: 'write_file', description: '', inputSchema: {}, server: 'files' },
        { name: 'other', description: '', inputSchema: {}, server: 'elsewhere' },
      ],
    })
    render(<Panel />)

    await waitFor(() => expect(readout('Tools')).toBe('2'))
    expect(screen.getByText('read_file')).toBeTruthy()
    // A tool from another server must not be counted into this one.
    expect(screen.queryByText('other')).toBeNull()
  })

  it('surfaces a server error rather than reporting it as merely off', async () => {
    statuses.value = [{ name: 'broken', status: 'error', error: 'spawn ENOENT' }]
    useMCPServers.setState({
      mcpServers: { broken: { command: 'nope', args: [], env: {} } },
    })
    render(<Panel />)

    expect(await screen.findByText('spawn ENOENT')).toBeTruthy()
    expect(screen.getByText('error')).toBeTruthy()
  })
})

describe('the Models panel', () => {
  const Panel = modelsPanel.component

  it('says no model is loaded rather than showing an empty list', () => {
    render(<Panel />)
    expect(screen.getByText('No model loaded.')).toBeTruthy()
  })

  it('distinguishes loading a model from having none', () => {
    useAppState.setState({ loadingModel: true })
    render(<Panel />)
    expect(screen.getByText('Loading a model…')).toBeTruthy()
  })

  it('reads an unmeasured token speed as a dash, not as a stalled model', () => {
    useAppState.setState({ activeModels: ['unsloth/Qwen3-4B-GGUF'] })
    render(<Panel />)

    expect(screen.getByText('Qwen3-4B-GGUF')).toBeTruthy()
    expect(readout('Speed')).toBe(NOT_AVAILABLE)
    expect(readout('Tokens')).toBe(NOT_AVAILABLE)
  })

  it('prints the measured speed and the owning provider', () => {
    useAppState.setState({
      activeModels: ['qwen3-4b'],
      tokenSpeed: { message: 'm', tokenSpeed: 42.42, tokenCount: 128, lastTimestamp: 0 },
    })
    useModelProvider.setState({
      providers: [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { provider: 'llamacpp', active: true, models: [{ id: 'qwen3-4b' }], settings: [] } as any,
      ],
    })
    render(<Panel />)

    expect(readout('Speed')).toBe('42.4 tok/s')
    expect(readout('Tokens')).toBe('128')
    expect(screen.getByText('llamacpp · 1')).toBeTruthy()
  })

  it('reads an unconfigured provider list as a dash', () => {
    render(<Panel />)
    expect(readout('Configured')).toBe(NOT_AVAILABLE)
    expect(readout('Enabled')).toBe(NOT_AVAILABLE)
  })

  it('reads an unknown engine build as a dash rather than guessing one', () => {
    useModelProvider.setState({
      providers: [
        // A provider with no `version_backend` recorded yet.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { provider: 'llamacpp', active: true, models: [], settings: [] } as any,
      ],
    })
    render(<Panel />)

    expect(readout('Backend')).toBe(NOT_AVAILABLE)
    expect(readout('Version')).toBe(NOT_AVAILABLE)
    expect(readout('Build')).toBe(NOT_AVAILABLE)
    // The provider itself is known, so that part is not a dash.
    expect(readout('Configured')).toBe('1')
  })

  it('splits the recorded engine version from its build', () => {
    useModelProvider.setState({
      providers: [
        {
          provider: 'llamacpp',
          active: true,
          models: [],
          settings: [
            {
              key: 'version_backend',
              title: 'Backend',
              description: '',
              controller_type: 'dropdown',
              controller_props: { value: 'b4567/linux-avx2-cuda-cu12.0' },
            },
          ],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ],
    })
    render(<Panel />)

    expect(readout('Backend')).toBe('llamacpp')
    expect(readout('Version')).toBe('b4567')
    expect(readout('Build')).toBe('linux-avx2-cuda-cu12.0')
  })
})

describe('the Local API server panel', () => {
  const Panel = apiServerPanel.component

  it('withholds the base URL while the server is down', () => {
    render(<Panel />)
    expect(screen.getByText('stopped')).toBeTruthy()
    // A reachable-looking URL for a server that is not listening sends people
    // to debug the wrong thing.
    expect(readout('Base URL')).toBe(NOT_AVAILABLE)
    expect(screen.getByText('Nothing served since the last start.')).toBeTruthy()
  })

  it('shows the address once the server is actually running', () => {
    useAppState.setState({ serverStatus: 'running' })
    render(<Panel />)
    expect(screen.getByText('running')).toBeTruthy()
    expect(readout('Base URL')).toBe('http://127.0.0.1:1337/v1')
  })

  it('dials 127.0.0.1 when the server is configured to listen on any address', () => {
    // 0.0.0.0 is a listen-any address, not a dial address. Printing it as the
    // base URL would hand someone an address that cannot be reached, which is
    // what a hand-rolled `http://${host}:${port}` in this panel did before it
    // went through the shared helper.
    useAppState.setState({ serverStatus: 'running' })
    useLocalApiServer.setState({ serverHost: '0.0.0.0', serverPort: 1337, apiPrefix: '/v1' })
    render(<Panel />)

    expect(readout('Base URL')).toBe('http://127.0.0.1:1337/v1')
    // The configuration row still reports what was actually configured.
    expect(readout('Host')).toBe('0.0.0.0')
  })

  it('repairs an API prefix that is missing its leading slash', () => {
    useAppState.setState({ serverStatus: 'running' })
    useLocalApiServer.setState({ serverHost: '127.0.0.1', serverPort: 1337, apiPrefix: 'v1' })
    render(<Panel />)
    expect(readout('Base URL')).toBe('http://127.0.0.1:1337/v1')
  })

  it('reports the API key as set without ever printing it', () => {
    useLocalApiServer.setState({ apiKey: 'sk-do-not-leak-this' })
    const { container } = render(<Panel />)

    expect(readout('API key')).toBe('set')
    expect(container.textContent).not.toContain('sk-do-not-leak-this')
  })

  it('shows a pending start as starting rather than as running', () => {
    useAppState.setState({ serverStatus: 'pending' })
    render(<Panel />)
    expect(screen.getByText('starting…')).toBeTruthy()
    expect(readout('Base URL')).toBe(NOT_AVAILABLE)
  })
})

describe('the Downloads panel', () => {
  const Panel = downloadsPanel.component

  it('says nothing is downloading rather than showing an empty frame', () => {
    render(<Panel />)
    expect(screen.getByText('Nothing downloading.')).toBeTruthy()
  })

  it('reads a transfer with no speed sample as a dash, not as stalled at zero', () => {
    useDownloadStore.setState({
      downloads: {
        a: {
          id: 'a',
          name: 'unsloth/Qwen3-4B-GGUF',
          progress: 0.25,
          current: 1024,
          total: 4096,
          speed: { bytesPerSecond: 0, atBytes: 1024, atTime: 0 },
        },
      },
    })
    render(<Panel />)

    expect(readout('Progress')).toBe('25%')
    expect(readout('Speed')).toBe(NOT_AVAILABLE)
    expect(readout('Remaining')).toBe(NOT_AVAILABLE)
  })

  it('prints speed and ETA once there is a sample', () => {
    useDownloadStore.setState({
      downloads: {
        a: {
          id: 'a',
          name: 'model.gguf',
          progress: 0.5,
          current: 50 * 1024 * 1024,
          total: 100 * 1024 * 1024,
          speed: { bytesPerSecond: 5 * 1024 * 1024, atBytes: 0, atTime: 0 },
        },
      },
    })
    render(<Panel />)

    expect(readout('Speed')).toBe('5.0 MB/s')
    expect(readout('Remaining')).toBe('10s')
  })

  it('drops the speed and ETA of a paused transfer instead of freezing them', () => {
    useDownloadStore.setState({
      downloads: {
        a: {
          id: 'a',
          name: 'model.gguf',
          progress: 0.5,
          current: 50 * 1024 * 1024,
          total: 100 * 1024 * 1024,
          speed: { bytesPerSecond: 5 * 1024 * 1024, atBytes: 0, atTime: 0 },
        },
      },
      pausedDownloads: new Set(['a']),
    })
    render(<Panel />)

    expect(screen.getByText('paused')).toBeTruthy()
    // The last sample is stale the moment the transfer stops; showing it
    // would read as progress that is not happening.
    expect(readout('Speed')).toBe(NOT_AVAILABLE)
    expect(readout('Remaining')).toBe(NOT_AVAILABLE)
  })
})

describe('the Skills panel', () => {
  const Panel = skillsPanel.component

  const skill = {
    name: 'pdf-forms',
    description: 'Fill in PDF forms',
    version: '1.0.0',
    requiresTools: [],
    requiresScripts: [],
    dangerous: false,
    platforms: null,
    enabled: false,
    compatible: true,
    reserved: false,
    unavailableReasons: [],
    needsReview: false,
    error: null,
  }

  it('shows a loading state before the first listing', () => {
    skillsHook.value = { ...skillsHook.value, loading: true, skills: [] }
    render(<Panel />)
    expect(screen.getByText('Loading…')).toBeTruthy()
  })

  it('says where to add one when none is installed', () => {
    render(<Panel />)
    expect(screen.getByText(/No skills installed/)).toBeTruthy()
  })

  it('shows no run count at all for a skill that has not run', () => {
    skillsHook.value = { ...skillsHook.value, skills: [skill] }
    render(<Panel />)

    expect(screen.getByText('pdf-forms')).toBeTruthy()
    expect(screen.getByText('0 of 1 on')).toBeTruthy()
    // "0 runs" would assert the skill has never been used; the message store
    // only holds the threads currently loaded, so it cannot know that.
    expect(screen.queryByText(/runs this session/)).toBeNull()
    expect(screen.queryByText(/^0 runs/)).toBeNull()
  })

  it('counts the runs recorded on message metadata', () => {
    skillsHook.value = { ...skillsHook.value, skills: [skill] }
    useMessages.setState({
      messages: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        t1: [
          { metadata: { agent_skill_name: 'pdf-forms' } },
          { metadata: { agent_skill_name: 'pdf-forms' } },
          { metadata: { agent_skill_name: 'other-skill' } },
          { metadata: {} },
          {},
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any,
      },
    })
    render(<Panel />)

    expect(screen.getByText('2 runs this session')).toBeTruthy()
  })

  it('pluralises a single run', () => {
    skillsHook.value = { ...skillsHook.value, skills: [skill] }
    useMessages.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: { t1: [{ metadata: { agent_skill_name: 'pdf-forms' } }] as any },
    })
    render(<Panel />)
    expect(screen.getByText('1 run this session')).toBeTruthy()
  })

  it('switches a skill on through the backend and reflects the new state', async () => {
    // A stateful stand-in for the hook, so the assertion is on what the user
    // ends up seeing rather than only on the call having been made: a switch
    // that fires the right call and then shows the old state is still broken.
    const calls: [string, boolean][] = []
    skillsHook.impl = () => {
      const [skills, setSkills] = useState([skill])
      return {
        skills,
        loading: false,
        error: null,
        load: vi.fn(),
        approve: vi.fn(),
        setEnabled: async (name: string, enabled: boolean) => {
          calls.push([name, enabled])
          setSkills((current) =>
            current.map((entry) => (entry.name === name ? { ...entry, enabled } : entry))
          )
        },
      }
    }
    render(<Panel />)

    const toggle = screen.getByRole('switch', { name: 'Enable pdf-forms' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('0 of 1 on')).toBeTruthy()

    fireEvent.click(toggle)

    await waitFor(() => expect(screen.getByText('1 of 1 on')).toBeTruthy())
    expect(
      screen.getByRole('switch', { name: 'Enable pdf-forms' }).getAttribute('aria-checked')
    ).toBe('true')
    // And it went through the backend rather than only flipping locally.
    expect(calls).toEqual([['pdf-forms', true]])
  })

  it('surfaces a refusal to switch a skill on', async () => {
    const setEnabled = vi.fn(async () => {
      throw new Error('skill is quarantined')
    })
    skillsHook.value = { ...skillsHook.value, skills: [skill], setEnabled }
    render(<Panel />)

    fireEvent.click(screen.getByRole('switch', { name: 'Enable pdf-forms' }))
    expect(await screen.findByText('skill is quarantined')).toBeTruthy()
  })

  it('asks for a review instead of offering a switch for an unreviewed skill', async () => {
    const approve = vi.fn(async () => {})
    skillsHook.value = {
      ...skillsHook.value,
      skills: [{ ...skill, needsReview: true }],
      approve,
    }
    render(<Panel />)

    expect(screen.queryByRole('switch')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Review and allow/ }))
    await waitFor(() => expect(approve).toHaveBeenCalledWith('pdf-forms'))
  })

  it('refuses to offer an incompatible skill, and says why', () => {
    skillsHook.value = {
      ...skillsHook.value,
      skills: [
        {
          ...skill,
          compatible: false,
          unavailableReasons: ['requires macOS'],
        },
      ],
    }
    render(<Panel />)

    expect(screen.getByRole('switch', { name: 'Enable pdf-forms' }).getAttribute('disabled')).not.toBeNull()
    expect(screen.getByText('requires macOS')).toBeTruthy()
    expect(screen.getByText('unavailable')).toBeTruthy()
  })
})
