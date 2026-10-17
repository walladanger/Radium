import { useLeftPanel } from '@/hooks/useLeftPanel'
import { cn } from '@/lib/utils'
import {
  IconLayoutSidebar,
  IconEdit,
} from '@tabler/icons-react'
import { ReactNode, memo } from 'react'
import { Button } from "@/components/ui/button"
import { useWorkspacePanel } from '@/hooks/useWorkspacePanel'
import { useTranslation } from '@/i18n/react-i18next-compat'

type HeaderPageProps = {
  children?: ReactNode
  // Onboarding has no sidebar to toggle, so it hides the download + toggle cluster.
  hideControls?: boolean
}
const HeaderPage = memo(function HeaderPage({
  children,
  hideControls,
}: HeaderPageProps) {
  const open = useLeftPanel((state) => state.open)
  const setLeftPanel = useLeftPanel((state) => state.setLeftPanel)
  const openAnnotations = useWorkspacePanel(state => state.openAnnotations)
  const { t } = useTranslation('atomic-tasks')

  return (
    <div
      className={cn(
        'h-15 flex items-center shrink-0',
        (IS_MACOS && !open) ? 'pl-24' : ' pl-4',
        children === undefined && 'border-none'
      )}
      // On macOS the element-based drag region approach is used: this div sits
      // inside the SidebarInset which is in normal document flow, so it is
      // always at its natural z-level and can receive mousedown events.
      // Tauri's drag handler excludes clicks on <button>, <input>, <a>,
      // <select>, and <textarea> elements automatically, so interactive
      // children remain clickable. A div-based trigger placed here would have
      // to stop mousedown propagation itself.
      {...(IS_MACOS ? { 'data-tauri-drag-region': true } : {})}
    >
      <div
        className={cn(
          'flex items-center w-full gap-1',
        )}
      >
        {!open && !hideControls && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              className='rounded-full relative z-50'
              onClick={() => setLeftPanel(!open)}
              aria-label="Toggle sidebar"
            >
              <IconLayoutSidebar
                className="text-muted-foreground relative size-4.5"
              />
            </Button>
          </>
        )}
        <div
          className={cn(
            'flex-1 min-w-0'
          )}
        >
          {children}
        </div>
        {!hideControls && IS_TAURI && !IS_IOS && !IS_ANDROID && <Button
          variant="ghost" size="icon-sm" className="mr-3 shrink-0"
          title={t('annotationOpen', { defaultValue: 'Open annotation log' })}
          aria-label={t('annotationOpen', { defaultValue: 'Open annotation log' })}
          onClick={openAnnotations}
        ><IconEdit className="size-4.5" aria-hidden="true" /></Button>}
      </div>
    </div>
  )
})

export default HeaderPage
