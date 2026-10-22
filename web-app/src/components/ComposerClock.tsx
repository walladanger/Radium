import { useEffect, useState } from 'react'

/** Isolated from the composer so a clock tick never re-renders its draft. */
export function ComposerClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return <time dateTime={now.toISOString()} aria-label="Current local time" className="text-xs tabular-nums text-muted-foreground">
    {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
  </time>
}

/** Saved messages retain their send time; only older days need a date. */
export function MessageTimestamp({ value }: { value: unknown }) {
  const [today, setToday] = useState(() => new Date().toDateString())
  useEffect(() => {
    const timer = window.setInterval(() => setToday(new Date().toDateString()), 60000)
    return () => window.clearInterval(timer)
  }, [])
  if (!(typeof value === 'number' || typeof value === 'string' || value instanceof Date)) return null
  const sent = new Date(value)
  if (!Number.isFinite(sent.getTime())) return null
  return <time dateTime={sent.toISOString()} title={sent.toLocaleString()} className="text-xs tabular-nums text-muted-foreground">
    {sent.toDateString() === today
      ? sent.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : sent.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
  </time>
}
