import { createFileRoute } from '@tanstack/react-router'

import { validateCloudSearch } from '@/lib/cloud-search'
import { CloudPage } from '@/routes/cloud/index'

/** Settings > Cloud: connecting cloud providers, inside the Settings frame. */
export const Route = createFileRoute('/settings/cloud')({
  component: CloudPage,
  validateSearch: validateCloudSearch,
})
