import { createFileRoute } from '@tanstack/react-router'

import { ApiPage } from '@/routes/api/index'

/** Settings > API: the Local API Server page, inside the Settings frame. */
export const Route = createFileRoute('/settings/api')({
  component: ApiPage,
})
