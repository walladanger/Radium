import { createFileRoute, redirect } from '@tanstack/react-router'
import { route } from '@/constants/routes'

// MCP management moved to the Connectors page (sidebar). The route stays as a
// redirect so old deep links keep working.
export const Route = createFileRoute('/settings/mcp-servers')({
  beforeLoad: () => {
    throw redirect({ to: route.connectors.index })
  },
})
