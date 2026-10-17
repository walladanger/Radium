import { useDownloadStore } from '@/hooks/useDownloadStore'
import {
  formatEta,
  formatProgressPair,
  formatSpeed,
  shortModelName,
} from '@/lib/downloadFormat'
import { Chip } from '../Chip'
import { PanelBody, Readout } from '../Readout'
import type { BuiltinPanel } from '../registry'

/**
 * The download queue.
 *
 * Speed and ETA come from the shared helpers rather than being recomputed
 * here, so this panel, the Hub card and the downloads popover quote the same
 * figure. Both helpers return `null` when there is nothing honest to say — no
 * sample yet, unknown total, an estimate long enough to only mislead — and
 * that `null` is passed straight through to a dash. An ETA invented from a
 * zeroed speed sample is the exact failure this panel must not have.
 */
function DownloadsPanel() {
  const downloads = useDownloadStore((state) => state.downloads)
  const paused = useDownloadStore((state) => state.pausedDownloads)

  const rows = Object.values(downloads).sort((left, right) =>
    left.name.localeCompare(right.name)
  )

  return (
    <PanelBody empty={rows.length === 0 ? 'Nothing downloading.' : null}>
      {rows.map((download) => {
        const isPaused = paused.has(download.id)
        const speed = formatSpeed(download.speed?.bytesPerSecond)
        const remaining = download.total - download.current
        const eta = formatEta(remaining, download.speed?.bytesPerSecond)
        return (
          <div key={download.id} className="space-y-1 rounded-md border border-border p-2">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-semibold" title={download.name}>
                {shortModelName(download.name)}
              </span>
              <div className="flex-1" />
              {isPaused ? <Chip tone="muted">paused</Chip> : <Chip>downloading</Chip>}
            </div>
            <Readout label="Progress" value={`${Math.round(download.progress * 100)}%`} />
            <Readout
              label="Transferred"
              value={
                download.total > 0
                  ? formatProgressPair(download.current, download.total)
                  : null
              }
            />
            {/* A paused transfer has no speed and no ETA — not a zero one. */}
            <Readout label="Speed" value={isPaused ? null : speed} />
            <Readout label="Remaining" value={isPaused ? null : eta} />
          </div>
        )
      })}
    </PanelBody>
  )
}

export const panel: BuiltinPanel = {
  id: 'downloads',
  name: 'Downloads',
  component: DownloadsPanel,
  defaultSize: { w: 4, h: 7 },
}
