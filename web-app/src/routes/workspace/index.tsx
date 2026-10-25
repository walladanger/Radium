import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceShell } from '@/panels/WorkspaceShell'
import { WorkspaceLauncher } from '@/panels/WorkspaceLauncher'
import { WorkspaceLease } from '@/panels/WorkspaceLease'

export const Route = createFileRoute('/workspace/')({
  component: () => IS_TAURI ? <WorkspaceLauncher /> : <WorkspaceLease><WorkspaceShell /></WorkspaceLease>,
})
