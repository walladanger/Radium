'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DocsRedirect({ to }: { to: string }) {
  const router = useRouter()
  useEffect(() => {
    router.replace(to)
  }, [router, to])
  return null
}
