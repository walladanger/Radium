'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Build-time data for the custom landing pages (home, download, blog,
 * changelog). Nextra 2 provided this through `getStaticProps` + `useData()`
 * from `nextra/data`; with the App Router the data is loaded by an async
 * server component and handed to the client tree through this context.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SSGDataContext = createContext<any>(undefined)

export function SSGDataProvider({
  value,
  children,
}: {
  value: unknown
  children: ReactNode
}) {
  return (
    <SSGDataContext.Provider value={value}>{children}</SSGDataContext.Provider>
  )
}

export function useData() {
  const value = useContext(SSGDataContext)
  if (value === undefined) {
    throw new Error('useData() must be used inside <SSGDataProvider>')
  }
  return value
}
