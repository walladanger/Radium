'use client'

import { useSyncExternalStore } from 'react'

export type Platform = 'mac' | 'windows' | 'linux'

/** Pure so it can be unit-tested; unknown agents fall back to Windows. */
export function platformFromUserAgent(userAgent: string): Platform {
  if (userAgent.includes('Windows')) return 'windows'
  if (userAgent.includes('Linux')) return 'linux'
  if (userAgent.includes('Mac OS')) return 'mac'
  return 'windows'
}

const subscribe = () => () => {}

/**
 * The visitor's OS, read from the user agent. The static HTML is rendered as
 * `serverDefault`; React swaps in the real value after hydration without a
 * state update in an effect.
 */
export function usePlatform(serverDefault: Platform = 'mac'): Platform {
  return useSyncExternalStore(
    subscribe,
    () => platformFromUserAgent(navigator.userAgent),
    () => serverDefault
  )
}
