import { describe, expect, it } from 'vitest'

import {
  agentToolPacks,
  buildAgentSpecialists,
  MAX_AGENT_SPECIALISTS,
} from '../agent-specialists'

function assistant(overrides: Partial<Assistant>): Assistant {
  return {
    id: 'id',
    name: 'Assistant',
    created_at: 0,
    instructions: '',
    parameters: {},
    ...overrides,
  }
}

const network = assistant({
  id: 'network',
  name: 'Network',
  description: 'Diagnoses Wi-Fi, DNS and LAN problems',
  instructions: 'Today is {{current_date}}. Prefer read-only checks.',
  specialist: true,
})

describe('buildAgentSpecialists', () => {
  it('offers only assistants marked as specialists', () => {
    const plain = assistant({ id: 'plain', name: 'Plain', description: 'x' })
    expect(buildAgentSpecialists([plain, network], undefined)).toEqual([
      expect.objectContaining({ name: 'Network' }),
    ])
  })

  it('never offers the thread assistant to itself', () => {
    expect(buildAgentSpecialists([network], 'network')).toEqual([])
  })

  it('skips a specialist without a description', () => {
    const vague = assistant({
      id: 'vague',
      name: 'Vague',
      description: '  ',
      specialist: true,
    })
    expect(buildAgentSpecialists([vague], undefined)).toEqual([])
  })

  it('renders instruction templates like the thread assistant does', () => {
    const [specialist] = buildAgentSpecialists([network], undefined)
    expect(specialist.instructions).not.toContain('{{current_date}}')
    expect(specialist.instructions).toContain('Prefer read-only checks.')
  })

  it('sends no instructions for a specialist without any', () => {
    const bare = assistant({ ...network, instructions: '' })
    expect(buildAgentSpecialists([bare], undefined)[0].instructions).toBe(
      undefined
    )
  })

  it('keeps the first of two specialists that share a name', () => {
    const duplicate = assistant({
      ...network,
      id: 'network-2',
      name: 'network',
      description: 'Second copy',
    })
    const specialists = buildAgentSpecialists([network, duplicate], undefined)
    expect(specialists).toHaveLength(1)
    expect(specialists[0].description).toBe(network.description)
  })

  it('caps the roster at the backend limit', () => {
    const many = Array.from({ length: MAX_AGENT_SPECIALISTS + 3 }, (_, i) =>
      assistant({
        id: `s${i}`,
        name: `Specialist ${i}`,
        description: 'Does things',
        specialist: true,
      })
    )
    expect(buildAgentSpecialists(many, undefined)).toHaveLength(
      MAX_AGENT_SPECIALISTS
    )
  })

  it('passes along known tool packs and drops unknown ones', () => {
    const tooled = assistant({
      ...network,
      tool_packs: ['network', 'teleportation'],
    })
    expect(buildAgentSpecialists([tooled], undefined)[0].tool_packs).toEqual([
      'network',
    ])
    expect(agentToolPacks(undefined)).toEqual([])
  })

  it('sends a specialist model with its capabilities and context window', () => {
    const local = assistant({
      ...network,
      specialist_model: { provider: 'llamacpp', id: 'qwen3-8b' },
    })
    const resolve = (provider: string, id: string) =>
      provider === 'llamacpp' && id === 'qwen3-8b'
        ? ({
            id,
            capabilities: ['tools'],
            settings: {
              ctx_len: { controller_props: { value: 32768 } },
            },
          } as unknown as Model)
        : undefined
    expect(buildAgentSpecialists([local], undefined, resolve)[0]).toMatchObject(
      {
        model_id: 'qwen3-8b',
        provider: 'llamacpp',
        capabilities: ['tools'],
        context_window: 32768,
      }
    )
  })

  it('still names an unknown specialist model so the backend can say so', () => {
    const missing = assistant({
      ...network,
      specialist_model: { provider: 'anthropic', id: 'gone' },
    })
    expect(
      buildAgentSpecialists([missing], undefined, () => undefined)[0]
    ).toMatchObject({
      model_id: 'gone',
      provider: 'anthropic',
      capabilities: [],
    })
  })

  it('shares the coordinator model when no specialist model is set', () => {
    const [specialist] = buildAgentSpecialists([network], undefined)
    expect(specialist.model_id).toBeUndefined()
    expect(specialist.provider).toBeUndefined()
  })
})
