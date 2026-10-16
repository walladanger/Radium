import type { ApiRequestStatus } from '@/types/apiServerLog'

export type StatusTone =
  | 'ready'
  | 'busy'
  | 'idle'
  | 'error'
  | 'warning'
  | 'pending'

export const REQUEST_TONE: Record<ApiRequestStatus, StatusTone> = {
  in_flight: 'busy',
  completed: 'ready',
  error: 'error',
  cancelled: 'warning',
}
