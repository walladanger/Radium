/**
 * Materialise a finished job's outputs, and put them in the library.
 *
 * Task 8 built `materialize()` and the library store but wired neither: the job
 * manager does not know the library exists, and the plan puts that meeting
 * point in Task 11. This hook is it.
 *
 * The invariant it upholds is decision Q4's: nothing renders a provider's own
 * output reference. Bytes land on disk first, and the preview is handed a local
 * path. That is why the CSP could be left alone rather than widened to allow
 * remote media for the entire application.
 *
 * Materialisation runs at most once per job. A repeat would re-download a file
 * that can be hundreds of megabytes and, on a metered provider, could be
 * charged for a second time - so the guard is keyed on the job id and survives
 * re-renders, rather than living in a dependency array.
 *
 * It takes the whole queue, not one job: now that the studio can queue jobs
 * during a render, the newest job is no longer the only one whose output must
 * reach the library. The preview still shows the newest job's asset; every
 * other succeeded job is materialised into the library in the background.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ulid } from 'ulidx'

import {
  createBrowserThumbnailer,
  materialize,
  type MaterializeContext,
  type MaterializeDeps,
  type MediaAsset,
} from '@/services/media/assets'
import {
  coreMediaFileSystem,
  mediaDataFolder,
  useMediaLibraryStore,
} from '@/stores/media-library-store'
import { chosenMediaOutputFolder } from '@/stores/media-output-store'
import type { MediaJobEntry } from '@/services/media/jobManager'
import type { MediaJobSnapshot } from '@/services/media/contract'

/** The real dependencies, for the running app. */
export const browserMaterializeDeps: MaterializeDeps = {
  fs: coreMediaFileSystem,
  dataFolder: mediaDataFolder,
  outputFolder: chosenMediaOutputFolder,
  fetchBytes: async (url: string) => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Fetching ${url} failed with ${response.status}`)
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    return {
      bytes,
      mime: response.headers.get('content-type') ?? undefined,
    }
  },
  now: () => Date.now(),
  newId: () => ulid(),
  // Non-fatal by contract: `materialize` keeps the asset if this throws, which
  // is what happens anywhere without a canvas.
  thumbnail: createBrowserThumbnailer(),
}

/** Injected so tests can drive the hook without a filesystem. */
type MaterializeFn = (
  snapshot: MediaJobSnapshot,
  context: MaterializeContext,
  deps: MaterializeDeps
) => Promise<MediaAsset[]>

export function useMediaJobAssets(
  jobs: MediaJobEntry[],
  modelLabel: string,
  deps: MaterializeDeps = browserMaterializeDeps,
  run: MaterializeFn = materialize
): MediaAsset | null {
  const [assets, setAssets] = useState<Record<string, MediaAsset>>({})
  const handled = useRef<Set<string>>(new Set())
  const add = useMediaLibraryStore((state) => state.add)

  const succeeded = useMemo(
    () => jobs.filter((entry) => entry.state === 'succeeded'),
    [jobs]
  )

  useEffect(() => {
    for (const entry of succeeded) {
      if (handled.current.has(entry.client_job_id)) continue
      handled.current.add(entry.client_job_id)

      void (async () => {
        try {
          const materialized = await run(
            entry,
            {
              request: entry.request,
              model_label: modelLabel,
              app_version: VERSION,
            },
            deps
          )
          if (materialized.length === 0) return

          await add(materialized)
          setAssets((prev) => ({
            ...prev,
            [entry.client_job_id]: materialized[0],
          }))
        } catch (error) {
          // A failed save must not take the screen down: the generation itself
          // succeeded, and the job status still says so.
          console.warn('[media] materialising the job outputs failed', error)
        }
      })()
    }
    // `succeeded` depends on the manager's entry objects, which it replaces on
    // every poll; the job id set is what actually decides whether there is new
    // work to do, and `handled` makes a re-run a no-op.
  }, [succeeded, modelLabel, add, deps, run])

  const latest = jobs[0]
  // A running or queued job has no asset yet, so a finished image never sits
  // over a generation that is still running.
  return latest ? (assets[latest.client_job_id] ?? null) : null
}
