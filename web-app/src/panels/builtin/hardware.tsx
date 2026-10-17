import { useHardware } from '@/hooks/useHardware'
import { formatMegaBytes } from '@/lib/utils'
import { Chip } from '../Chip'
import { PanelBody, Readout, Section } from '../Readout'
import type { BuiltinPanel } from '../registry'

/**
 * Hardware and resource telemetry.
 *
 * Reads the existing system-monitor store; it adds no polling of its own, so
 * opening the panel costs nothing the app was not already paying.
 *
 * `useHardware` persists its last enumeration, which is why `hardwareReady`
 * exists: the numbers on screen a moment after launch may be last week's.
 * Static facts (core count, VRAM) are safe to draw from the persisted copy —
 * hardware does not change between runs often enough to matter. *Live* usage
 * is not: a stale CPU percentage is a lie about this instant. So usage is
 * gated on a sample having actually arrived this session, and a sample is
 * recognised by `total_memory` being non-zero, which no real machine reports.
 */
function HardwarePanel() {
  const hardwareData = useHardware((state) => state.hardwareData)
  const hardwareReady = useHardware((state) => state.hardwareReady)
  const systemUsage = useHardware((state) => state.systemUsage)

  const { cpu, gpus, os, os_name, total_memory } = hardwareData
  const sampled = systemUsage.total_memory > 0
  const usageByGpu = new Map(systemUsage.gpus.map((gpu) => [gpu.uuid, gpu]))

  // Nothing persisted and nothing enumerated yet: the first run, mid-probe.
  const probing = !hardwareReady && !cpu.name && total_memory === 0

  return (
    <PanelBody loading={probing}>
      <Section title="System">
        <Readout label="OS" value={os_name || os?.name} mono={false} />
        <Readout label="Version" value={os?.version} />
      </Section>

      <Section title="CPU">
        <Readout label="Model" value={cpu.name} mono={false} />
        <Readout label="Cores" value={cpu.core_count || null} />
        <Readout label="Architecture" value={cpu.arch} />
        <Readout
          label="Usage"
          value={sampled ? `${Math.round(systemUsage.cpu)}%` : null}
        />
      </Section>

      <Section title="Memory">
        <Readout
          label="Total"
          value={total_memory > 0 ? formatMegaBytes(total_memory) : null}
        />
        <Readout
          label="In use"
          value={sampled ? formatMegaBytes(systemUsage.used_memory) : null}
        />
        <Readout
          label="Free"
          value={
            sampled && total_memory > 0
              ? formatMegaBytes(Math.max(0, total_memory - systemUsage.used_memory))
              : null
          }
        />
      </Section>

      <Section title={gpus.length === 1 ? 'GPU' : 'GPUs'}>
        {gpus.length === 0 ? (
          <div className="text-muted-foreground">
            {hardwareReady
              ? 'No discrete GPU detected.'
              : 'Not enumerated this session.'}
          </div>
        ) : (
          gpus.map((gpu) => {
            const usage = usageByGpu.get(gpu.uuid)
            return (
              <div key={gpu.uuid || gpu.name} className="space-y-1 rounded-md border border-border p-2">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold" title={gpu.name}>
                    {gpu.name}
                  </span>
                  <div className="flex-1" />
                  {gpu.activated && <Chip>active</Chip>}
                </div>
                <Readout label="Vendor" value={gpu.vendor} mono={false} />
                <Readout
                  label="VRAM"
                  value={gpu.total_memory > 0 ? formatMegaBytes(gpu.total_memory) : null}
                />
                <Readout
                  label="VRAM in use"
                  value={usage ? formatMegaBytes(usage.used_memory) : null}
                />
                <Readout label="Driver" value={gpu.driver_version} />
              </div>
            )
          })
        )}
      </Section>
    </PanelBody>
  )
}

export const panel: BuiltinPanel = {
  id: 'hardware',
  name: 'Hardware',
  component: HardwarePanel,
  defaultSize: { w: 4, h: 10 },
}
