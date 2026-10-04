/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from '@tanstack/react-router'
import { route } from '@/constants/routes'
import { WorkspaceShell } from '@/panels/WorkspaceShell'

export const Route = createFileRoute(route.workspace.index as any)({
  component: WorkspaceShell,
})
