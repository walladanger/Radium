import { describe, it, expect } from 'vitest'
import {
  NETWORK_SPECIALIST_TEMPLATE,
  COMPUTER_CARE_SPECIALIST_TEMPLATE,
} from '../assistant-templates'

describe('assistant-templates', () => {
  it('NETWORK_SPECIALIST_TEMPLATE has expected behavioral invariants', () => {
    // Exact values
    expect(NETWORK_SPECIALIST_TEMPLATE.id).toBe('network-specialist')
    expect(NETWORK_SPECIALIST_TEMPLATE.avatar).toBe('🛜')
    expect(NETWORK_SPECIALIST_TEMPLATE.name).toBe('Network')
    expect(NETWORK_SPECIALIST_TEMPLATE.specialist).toBe(true)
    expect(NETWORK_SPECIALIST_TEMPLATE.tool_packs).toStrictEqual(['network'])

    // Descriptions are a single line under 200 chars
    expect(NETWORK_SPECIALIST_TEMPLATE.description).not.toMatch(/\n/)
    expect(NETWORK_SPECIALIST_TEMPLATE.description.length).toBeLessThan(200)

    // Instructions end with "Today is {{current_date}}."
    expect(NETWORK_SPECIALIST_TEMPLATE.instructions.endsWith('Today is {{current_date}}.')).toBe(true)

    // Network template only names net.* tools
    const toolMatches = NETWORK_SPECIALIST_TEMPLATE.instructions.match(/\b(net|sys)\.[a-z_]+/g) || []
    for (const tool of toolMatches) {
      expect(tool.startsWith('net.')).toBe(true)
    }

    // Network instructions mention net.system_map first
    const firstToolMatch = toolMatches[0]
    expect(firstToolMatch).toBe('net.system_map')

    // Network instructions warn about net.stack_reset
    expect(NETWORK_SPECIALIST_TEMPLATE.instructions.includes('net.stack_reset')).toBe(true)
  })

  it('COMPUTER_CARE_SPECIALIST_TEMPLATE has expected behavioral invariants', () => {
    // Exact values
    expect(COMPUTER_CARE_SPECIALIST_TEMPLATE.id).toBe('computer-care-specialist')
    expect(COMPUTER_CARE_SPECIALIST_TEMPLATE.avatar).toBe('🧰')
    expect(COMPUTER_CARE_SPECIALIST_TEMPLATE.name).toBe('Computer care')
    expect(COMPUTER_CARE_SPECIALIST_TEMPLATE.specialist).toBe(true)
    expect(COMPUTER_CARE_SPECIALIST_TEMPLATE.tool_packs).toStrictEqual(['computer'])

    // Descriptions are a single line under 200 chars
    expect(COMPUTER_CARE_SPECIALIST_TEMPLATE.description).not.toMatch(/\n/)
    expect(COMPUTER_CARE_SPECIALIST_TEMPLATE.description.length).toBeLessThan(200)

    // Instructions end with "Today is {{current_date}}."
    expect(COMPUTER_CARE_SPECIALIST_TEMPLATE.instructions.endsWith('Today is {{current_date}}.')).toBe(true)

    // Computer-care template only names sys.* tools
    const toolMatches = COMPUTER_CARE_SPECIALIST_TEMPLATE.instructions.match(/\b(net|sys)\.[a-z_]+/g) || []
    for (const tool of toolMatches) {
      expect(tool.startsWith('sys.')).toBe(true)
    }

    // Computer-care instructions mention sys.overview first
    const firstToolMatch = toolMatches[0]
    expect(firstToolMatch).toBe('sys.overview')

    // Computer-care instructions say large items are never deleted
    expect(COMPUTER_CARE_SPECIALIST_TEMPLATE.instructions.includes('never delete them yourself')).toBe(true)
  })

  it('ensures data invariants across all exported templates', () => {
    const templates = [
      NETWORK_SPECIALIST_TEMPLATE,
      COMPUTER_CARE_SPECIALIST_TEMPLATE,
    ]

    const ids = templates.map((t) => t.id)
    const uniqueIds = Array.from(new Set(ids))
    expect(ids).toStrictEqual(uniqueIds)

    expect(ids).toStrictEqual([
      'network-specialist',
      'computer-care-specialist',
    ])

    for (const template of templates) {
      expect(template.id.length > 0).toBe(true)
      expect(template.avatar.length > 0).toBe(true)
      expect(template.name.length > 0).toBe(true)
      expect(template.description.length > 0).toBe(true)
      expect(template.instructions.length > 0).toBe(true)
    }
  })
})
