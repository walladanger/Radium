import { IconX } from '@tabler/icons-react'
import { DownloadIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { cn } from '@/lib/utils'
import {
  overallDownloadProgress,
  useDownloadDrawer,
} from '@/stores/download-drawer-store'
import { DownloadProgressRow } from './DownloadProgressRow'

/**
 * The sidebar entry for downloads: a progress ring with a count. It is absent
 * when nothing is downloading, and sits above Settings in both the open and the
 * icon-only sidebar.
 */
export function DownloadRailButton() {
  const { t } = useTranslation()
  const items = useDownloadDrawer((state) => state.items)
  const open = useDownloadDrawer((state) => state.open)
  const setOpen = useDownloadDrawer((state) => state.setOpen)

  if (items.length === 0) return null
  const percent = Math.round(overallDownloadProgress(items) * 100)

  return (
    <button
      type="button"
      data-testid="download-rail-button"
      aria-label={t('common:downloads')}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={cn(
        'flex h-9 w-full cursor-pointer items-center gap-2 rounded-md p-2 text-left text-sm outline-hidden',
        'hover:bg-sidebar-foreground/8',
        open && 'bg-sidebar-foreground/15',
        'group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0'
      )}
    >
      {/* A conic ring rather than an SVG: the sidebar rescales every SVG in its
          buttons for the icon-only state, which would distort a drawn ring. */}
      <span
        className="relative grid size-6 shrink-0 place-items-center rounded-full"
        style={{
          background: `conic-gradient(var(--color-emerald-400) ${percent}%, color-mix(in oklab, currentColor 18%, transparent) 0)`,
        }}
      >
        <span className="absolute inset-[3px] rounded-full bg-sidebar" />
        <DownloadIcon className="relative z-10 size-3 text-foreground/70" />
        <span className="absolute -right-1.5 -top-1.5 z-10 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-semibold tabular-nums text-white">
          {items.length}
        </span>
      </span>
      <span className="truncate group-data-[collapsible=icon]:hidden">
        {t('common:downloads')}
      </span>
      <span className="ml-auto text-xs tabular-nums text-muted-foreground group-data-[collapsible=icon]:hidden">
        {percent}%
      </span>
    </button>
  )
}

/** Slides out beside the sidebar; every transfer with its pause and cancel. */
export function DownloadDrawer() {
  const { t } = useTranslation()
  const { state } = useSidebar()
  const items = useDownloadDrawer((s) => s.items)
  const open = useDownloadDrawer((s) => s.open)
  const setOpen = useDownloadDrawer((s) => s.setOpen)
  const shown = open && items.length > 0

  return (
    <aside
      aria-label={t('common:downloads')}
      aria-hidden={!shown}
      inert={!shown}
      data-testid="download-drawer"
      className={cn(
        'fixed inset-y-2 z-40 flex w-80 max-w-[calc(100vw-5rem)] flex-col gap-3 rounded-2xl border bg-background p-3 shadow-xl',
        'transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        shown
          ? 'translate-x-0 opacity-100'
          : 'pointer-events-none -translate-x-6 opacity-0'
      )}
      style={{
        left:
          state === 'collapsed'
            ? 'calc(var(--sidebar-width-icon, 3rem) + 1.75rem)'
            : 'calc(var(--sidebar-width, 15rem) + 0.75rem)',
      }}
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {t('common:downloads')}
          <span className="rounded-full bg-muted-foreground/15 px-1.5 text-xs tabular-nums text-muted-foreground">
            {items.length}
          </span>
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setOpen(false)}
          aria-label={t('common:downloadPanel.collapse')}
        >
          <IconX size={16} className="text-muted-foreground" />
        </Button>
      </header>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {items.map((item) => (
          <DownloadProgressRow key={item.id} {...item} />
        ))}
      </ul>
    </aside>
  )
}
