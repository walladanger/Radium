import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { captureAnnotation, productionLog, readAnnotationPng, type AnnotationImage,
  type ProductionAnnotation, type ProductionLogSnapshot } from '@/lib/production-log'

const message = (error: unknown) => error instanceof Error ? error.message : String(error)

/** Also used in General settings; native folder selection persists across restarts. */
export function ProductionLogFolder() {
  const { t } = useTranslation('atomic-tasks')
  const [folder, setFolder] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    const load = () => { void productionLog.load().then(value => { if (active && value) setFolder(value.folder) })
      .catch(reason => { if (active) setError(message(reason)) })
    }
    load()
    window.addEventListener('atomic-production-log-folder-changed', load)
    return () => { active = false; window.removeEventListener('atomic-production-log-folder-changed', load) }
  }, [])
  return <div className="space-y-2 text-sm">
    <p>{t('annotationFolderIntro', { defaultValue: 'Screenshots and notes are saved together in this folder. Changing it leaves existing logs in place.' })}</p>
    <p className="break-all text-xs" aria-label={t('annotationFolder', { defaultValue: 'Production log folder' })}>{folder}</p>
    <Button variant="outline" disabled={busy} onClick={async () => {
      setBusy(true); setError('')
      try { const value = await productionLog.chooseFolder(); if (value) setFolder(value.folder) }
      catch (reason) { setError(message(reason)) }
      finally { setBusy(false) }
    }}>{t('annotationChooseFolder', { defaultValue: 'Choose log folder' })}</Button>
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </div>
}

function EntryImage({ entry, folder }: { entry: ProductionAnnotation; folder: string }) {
  const { t } = useTranslation('atomic-tasks')
  const container = useRef<HTMLDivElement>(null)
  const [image, setImage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    let started = false
    const load = () => {
      if (started) return
      started = true
      void productionLog.image(folder, entry.id).then(value => { if (active) setImage(value) })
        .catch(reason => { if (active) setError(message(reason)) })
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null
      : new IntersectionObserver(items => { if (items.some(item => item.isIntersecting)) { load(); observer?.disconnect() } })
    if (observer && container.current) observer.observe(container.current)
    else load()
    return () => { active = false; observer?.disconnect() }
  }, [folder, entry.id])
  return <div ref={container} className="min-h-12 space-y-2">
    {image && <img src={image} alt={t('annotationSavedScreenshot', { defaultValue: 'Screenshot attached to this annotation' })} className="h-auto max-w-full rounded border" />}
    <Button variant="outline" size="sm" disabled={busy} onClick={async () => {
      setBusy(true); setError('')
      try { setImage(await productionLog.image(folder, entry.id, true)) }
      catch (reason) { setError(message(reason)) }
      finally { setBusy(false) }
    }}>{t('annotationFullSize', { defaultValue: 'Load full screenshot' })}</Button>
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </div>
}

export function ProductionLog() {
  const { t } = useTranslation('atomic-tasks')
  const [log, setLog] = useState<ProductionLogSnapshot | null>(null)
  const [note, setNote] = useState('')
  const [url, setUrl] = useState('')
  const [image, setImage] = useState<AnnotationImage | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const refresh = async () => { setLog(await productionLog.load()) }
  useEffect(() => {
    let active = true
    const load = () => { void productionLog.load().then(value => { if (active) setLog(value) }).catch(reason => { if (active) setError(message(reason)) }) }
    load()
    window.addEventListener('focus', load)
    window.addEventListener('atomic-production-log-folder-changed', load)
    return () => {
      active = false
      window.removeEventListener('focus', load)
      window.removeEventListener('atomic-production-log-folder-changed', load)
    }
  }, [])
  const action = async (work: () => Promise<void>) => {
    setBusy(true); setError(''); setSaved(false)
    try { await work() } catch (reason) { setError(message(reason)) }
    finally { setBusy(false) }
  }
  return <section aria-label={t('annotationLog', { defaultValue: 'Annotating log' })} className="space-y-4">
    <p className="text-sm text-muted-foreground">{t('annotationIntro', { defaultValue: 'Keep edits, quick memory notes and screenshots at the point they were recorded. This log stays on your computer.' })}</p>
    <div className="space-y-2 rounded border p-3">
      <p className="break-all text-xs" aria-label={t('annotationFolder', { defaultValue: 'Production log folder' })}>{log?.folder}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void action(async () => { const next = await productionLog.chooseFolder(); if (next) setLog(next) })}>{t('annotationChooseFolder', { defaultValue: 'Choose log folder' })}</Button>
        <Button variant="outline" disabled={busy} onClick={() => void action(refresh)}>{t('annotationReload', { defaultValue: 'Reload log' })}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('annotationFolderHint', { defaultValue: 'Choose your Debugging logs / Radium Production log folder here or in General settings. Existing entries stay in their original folder.' })}</p>
    </div>
    <form className="space-y-3" onSubmit={event => {
      event.preventDefault()
      if (!log) return
      void action(async () => {
        const entry = await productionLog.save(log.folder, note, url, image)
        // Publish the durable entry immediately. A later reload failure must
        // never make a successful save look failed and invite duplicate saves.
        setLog(current => current ? { ...current, entries: [entry, ...current.entries].slice(0, 50) } : current)
        setNote(''); setUrl(''); setImage(null); setSaved(true)
      })
    }} onPaste={event => {
      if (busy) return
      const file = [...event.clipboardData.files].find(item => item.type === 'image/png')
      if (file) { event.preventDefault(); void action(async () => { setImage(await readAnnotationPng(file)) }) }
    }}>
      <label className="block text-sm">{t('annotationNote', { defaultValue: 'Edit or memory note' })}<textarea value={note} maxLength={16000} disabled={busy} onChange={event => { setNote(event.target.value); setSaved(false) }} className="mt-1 min-h-28 w-full rounded border bg-background p-2" /></label>
      <label className="block text-sm">{t('annotationPage', { defaultValue: 'Page address (optional)' })}<Input value={url} maxLength={4096} disabled={busy} onChange={event => setUrl(event.target.value)} /></label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void action(async () => { setImage(await captureAnnotation()) })}>{t('annotationCapture', { defaultValue: 'Capture screenshot' })}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}>{t('annotationAttach', { defaultValue: 'Attach PNG' })}</Button>
        <input ref={input} type="file" accept="image/png" aria-label={t('annotationFile', { defaultValue: 'Screenshot file' })} className="sr-only" disabled={busy} onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void action(async () => { setImage(await readAnnotationPng(file)) })
        }} />
      </div>
      {image && <figure className="space-y-2">
        <img src={image.dataUrl} alt={t('annotationPreview', { defaultValue: 'Screenshot ready to attach' })} className="h-auto max-w-full rounded border" />
        <figcaption className="text-xs">{image.capturedAt ? `${t('annotationCaptured', { defaultValue: 'Captured' })}: ${new Date(image.capturedAt).toLocaleString()}` : t('annotationImported', { defaultValue: 'Attached image — original capture time is unknown' })}</figcaption>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setImage(null)}>{t('annotationRemove', { defaultValue: 'Remove screenshot' })}</Button>
      </figure>}
      <Button type="submit" disabled={busy || !log || !note.trim()}>{t('annotationSave', { defaultValue: 'Save annotation' })}</Button>
      {saved && <p role="status">{t('annotationSaved', { defaultValue: 'Annotation and screenshot saved together.' })}</p>}
    </form>
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    <ol className="space-y-4" aria-label={t('annotationHistory', { defaultValue: 'Saved annotations' })}>
      {log?.entries.map(entry => <li key={`${log.folder}/${entry.id}`} className="space-y-3 rounded border p-3">
        <h3 className="text-sm font-medium">{t('annotationEntry', { defaultValue: 'Annotating' })} · <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time></h3>
        <p className="whitespace-pre-wrap break-words text-sm">{entry.note}</p>
        {entry.page_url && <p className="break-all text-xs">{entry.page_url}</p>}
        {entry.screenshot && <>
          <p className="text-xs text-muted-foreground">{entry.captured_at ? `${t('annotationCaptured', { defaultValue: 'Captured' })}: ${new Date(entry.captured_at).toLocaleString()}` : t('annotationImported', { defaultValue: 'Attached image — original capture time is unknown' })}</p>
          <EntryImage entry={entry} folder={log.folder} />
        </>}
      </li>)}
    </ol>
    {log && !log.entries.length && <p className="text-sm">{t('annotationEmpty', { defaultValue: 'No annotations in this folder yet.' })}</p>}
    {log?.entries.length === 50 && <p className="text-xs">{t('annotationRecent', { defaultValue: 'Showing the latest 50 entries. Older entries remain in the log folder.' })}</p>}
  </section>
}
