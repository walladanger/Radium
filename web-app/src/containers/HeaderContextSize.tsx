import { memo, useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ContextSizeControl } from '@/containers/ContextSizeControl'
import {
  NEW_THREAD_ATTACHMENT_KEY,
  useChatAttachments,
} from '@/hooks/useChatAttachments'
import { useMessages } from '@/hooks/useMessages'
import { useThreads } from '@/hooks/useThreads'
import { cn } from '@/lib/utils'
import { useHeaderOverlay } from '@/stores/header-overlay-store'

const imageMimeFromName = (fileName: string): string => {
  switch (fileName.toLowerCase().split('.').pop()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    default:
      return ''
  }
}

/**
 * The context gauge reads the active thread and pending attachments itself.
 * It can sit beside the composer without threading draft state through routes.
 * Providers with no context setting render no control.
 */
const HeaderContextSize = memo(function HeaderContextSize({ placement = 'header' }: { placement?: 'header' | 'composer' }) {
  const currentThreadId = useThreads((state) => state.currentThreadId)
  const messages = useMessages(
    useShallow((state) =>
      currentThreadId ? state.messages[currentThreadId] : []
    )
  )
  const attachments = useChatAttachments(
    useCallback(
      (state) =>
        state.getAttachments(currentThreadId ?? NEW_THREAD_ATTACHMENT_KEY),
      [currentThreadId]
    )
  )

  const uploadedFiles = useMemo(
    () =>
      attachments
        .filter((a) => a.type === 'image' && a.dataUrl)
        .map((a) => ({
          name: a.name,
          type: a.mimeType || imageMimeFromName(a.name),
          size: a.size || 0,
          base64: a.base64 || '',
          dataUrl: a.dataUrl!,
        })),
    [attachments]
  )

  // Clears the floating corner buttons (32px each, 12px off the window edge)
  // whenever the agent workspace paints them over this corner.
  const overlayButtons = useHeaderOverlay((state) => state.rightOverlayButtons)

  return (
    <div
      className={cn(
        'shrink-0',
        placement === 'header' && overlayButtons === 1 && 'mr-10',
        placement === 'header' && overlayButtons >= 2 && 'mr-20'
      )}
    >
      <ContextSizeControl
        placement={placement}
        messages={messages || []}
        uploadedFiles={uploadedFiles}
      />
    </div>
  )
})

export default HeaderContextSize
