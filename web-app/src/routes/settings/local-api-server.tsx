import { createFileRoute, redirect } from '@tanstack/react-router'
import { route } from '@/constants/routes'

/**
 * The Local API Server page lives at Settings > API. This older address is
 * still reachable by URL and from older links, so it forwards rather than
 * 404s.
 */
export const Route = createFileRoute('/settings/local-api-server')({
  beforeLoad: () => {
    throw redirect({ to: route.settings.api })
  },
})
