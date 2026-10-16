/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from '@tanstack/react-router'
import { route } from '@/constants/routes'
import { WorkspaceShell } from '@/panels/WorkspaceShell'
import { WorkspaceLauncher } from '@/panels/WorkspaceLauncher'
import { WorkspaceLease } from '@/panels/WorkspaceLease'

export const Route = createFileRoute(route.workspace.index as any)({
  component: () => IS_TAURI ? <WorkspaceLauncher /> : <WorkspaceLease><WorkspaceShell /></WorkspaceLease>,
})
