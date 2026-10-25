import { createFileRoute } from '@tanstack/react-router'

import { RunSettingsPanel } from '@/containers/RunSettingsPanel'
import { SettingsPageLayout } from '@/containers/SettingsPageLayout'

export const Route = createFileRoute('/settings/chat')({
  component: ChatSettings,
})

/**
 * Settings > Chat: the run settings (assistant, system prompt, model load
 * options, sampling) that used to open beside the chat. The chat's sliders
 * button now brings you here. The controls are the panel's own, so there is
 * one copy to maintain; they apply to the chat you came from, or to new chats.
 */
function ChatSettings() {
  return (
    <SettingsPageLayout>
      <div className="max-w-xl">
        <RunSettingsPanel />
      </div>
    </SettingsPageLayout>
  )
}
