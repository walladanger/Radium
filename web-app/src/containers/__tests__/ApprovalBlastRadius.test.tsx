import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApprovalBlastRadius } from '@/containers/ApprovalBlastRadius'
import { readBlastRadius } from '@/lib/blast-radius'

const preview = {
  action: 'Change the DNS servers of Wi-Fi to 1.1.1.1.',
  adapter: 'Wi-Fi',
  blastRadius: {
    action: 'Change the DNS servers of Wi-Fi to 1.1.1.1.',
    changes: 'Wi-Fi will look up website names using 1.1.1.1.',
    disruption: 'A moment while caches refresh.',
    affects: 'All apps using that adapter.',
    undo: 'Run net.set_dns again with the previous servers.',
    needsAdmin: true,
    needsReboot: false,
    risk: 'medium',
  },
}

describe('readBlastRadius', () => {
  it('reads the blast radius a network fix sends', () => {
    expect(readBlastRadius(preview)).toMatchObject({
      risk: 'medium',
      needsAdmin: true,
      needsReboot: false,
    })
  })

  it('ignores previews without one or with an unknown risk', () => {
    expect(readBlastRadius({ path: 'notes.txt' })).toBeNull()
    expect(readBlastRadius(null)).toBeNull()
    expect(
      readBlastRadius({
        blastRadius: { ...preview.blastRadius, risk: 'catastrophic' },
      })
    ).toBeNull()
  })
})

describe('ApprovalBlastRadius', () => {
  it('shows the action, its consequences, risk and admin need up front', () => {
    render(<ApprovalBlastRadius radius={readBlastRadius(preview)!} />)
    expect(
      screen.getByText('Change the DNS servers of Wi-Fi to 1.1.1.1.')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Run net.set_dns again with the previous servers.')
    ).toBeInTheDocument()
    expect(
      screen.getByText('chat:agentApproval.blastRadius.risk.medium')
    ).toBeInTheDocument()
    expect(
      screen.getByText('chat:agentApproval.blastRadius.needsAdmin')
    ).toBeInTheDocument()
    expect(
      screen.queryByText('chat:agentApproval.blastRadius.needsReboot')
    ).toBeNull()
  })
})
