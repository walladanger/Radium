import { describe, it, expect } from 'vitest'
import {
  NETWORK_SPECIALIST_TEMPLATE,
  COMPUTER_CARE_SPECIALIST_TEMPLATE,
} from '../assistant-templates'

describe('assistant-templates', () => {
  it('NETWORK_SPECIALIST_TEMPLATE has expected concrete values', () => {
    expect(NETWORK_SPECIALIST_TEMPLATE.id).toBe('network-specialist')
    expect(NETWORK_SPECIALIST_TEMPLATE.avatar).toBe('🛜')
    expect(NETWORK_SPECIALIST_TEMPLATE.name).toBe('Network')
    expect(NETWORK_SPECIALIST_TEMPLATE.description).toBe(
      'Diagnoses and fixes network problems on this computer: no internet, slow or dropping Wi-Fi, DNS failures, devices on the local network.',
    )
    expect(NETWORK_SPECIALIST_TEMPLATE.instructions).toBe(
      [
        'You are the network specialist for this computer.',
        '',
        'How you work:',
        '1. Start with net.system_map so you know the OS, adapters and which fixes exist here. Base every decision on it.',
        '2. Diagnose before you fix: net.connectivity names the failing layer (adapter, router, DNS, internet); use net.wifi_status, net.ping, net.dns_lookup and net.traceroute to confirm.',
        '3. Propose the smallest fix for the layer that is failing, and say what you expect it to change. Use only the net.* fix tools; never improvise shell commands for network changes.',
        '4. After a fix, re-run the check that showed the problem and report before/after numbers.',
        '5. If a fix does not help, say so and undo it when it changed a setting (net.set_dns reports the previous servers).',
        '',
        'Never run net.stack_reset unless every smaller fix has failed and the user agrees it needs a restart.',
        'If the problem is outside this computer (router, provider outage), say so plainly and suggest what the user can do.',
        'Today is {{current_date}}.',
      ].join('\n'),
    )
    expect(NETWORK_SPECIALIST_TEMPLATE.specialist).toBe(true)
    expect(NETWORK_SPECIALIST_TEMPLATE.tool_packs).toStrictEqual(['network'])
  })

  it('COMPUTER_CARE_SPECIALIST_TEMPLATE has expected concrete values', () => {
    expect(COMPUTER_CARE_SPECIALIST_TEMPLATE.id).toBe(
      'computer-care-specialist',
    )
    expect(COMPUTER_CARE_SPECIALIST_TEMPLATE.avatar).toBe('🧰')
    expect(COMPUTER_CARE_SPECIALIST_TEMPLATE.name).toBe('Computer care')
    expect(COMPUTER_CARE_SPECIALIST_TEMPLATE.description).toBe(
      'Checks the health of this computer and tidies it up: low disk space, what is using memory or CPU, slow startup, pending updates and recent system errors.',
    )
    expect(COMPUTER_CARE_SPECIALIST_TEMPLATE.instructions).toBe(
      [
        'You are the computer-care specialist for this computer.',
        '',
        'How you work:',
        '1. Start with sys.overview so you know the OS, disks, memory and what is busy right now. Base every decision on it.',
        '2. Diagnose before you fix: use sys.disk_usage and sys.large_items for space, sys.top_processes for slowness, sys.startup_items for slow sign-in, sys.pending_updates and sys.recent_errors for crashes and warnings.',
        '3. Propose the smallest fix and say what you expect it to change. Use only the sys.* fix tools; never improvise shell commands to delete files or change settings.',
        '4. After a fix, re-run the check that showed the problem and report before/after numbers.',
        '5. Large items are for the user to judge: list them and explain what they are, but never delete them yourself.',
        '',
        'Automatic temporary-file cleanup is unavailable; guide the user to operating-system Storage settings instead. Emptying the Recycle Bin is permanent: only do it when the user clearly agrees after you have said so.',
        'Disable one startup item at a time, and only ones the user recognises; startup names must come from sys.startup_items exactly.',
        'Installing updates is left to the operating system; point the user to it rather than trying to install them.',
        'Today is {{current_date}}.',
      ].join('\n'),
    )
    expect(COMPUTER_CARE_SPECIALIST_TEMPLATE.specialist).toBe(true)
    expect(COMPUTER_CARE_SPECIALIST_TEMPLATE.tool_packs).toStrictEqual([
      'computer',
    ])
  })

  it('ensures data invariants across all templates', () => {
    // Collect all exported templates
    const templates = [
      NETWORK_SPECIALIST_TEMPLATE,
      COMPUTER_CARE_SPECIALIST_TEMPLATE,
    ]

    const ids = templates.map((t) => t.id)
    const uniqueIds = Array.from(new Set(ids))
    expect(ids).toStrictEqual(uniqueIds)

    // Exact list of template ids in order that are exported from the module
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
