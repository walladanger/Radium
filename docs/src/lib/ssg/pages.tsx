import { Suspense } from 'react'
import Home from '@/components/Home'
import Download from '@/components/Download'
import Blog from '@/components/Blog'
import Changelog from '@/components/Changelog'
import { SSGDataProvider } from './context'
import {
  loadBlogPosts,
  loadChangelog,
  loadDownloadData,
  loadHomeData,
} from './loaders'

// Async server components used from the MDX pages in src/content.

export async function HomePage() {
  return (
    <SSGDataProvider value={await loadHomeData()}>
      <Home />
    </SSGDataProvider>
  )
}

export async function DownloadPage() {
  return (
    <SSGDataProvider value={await loadDownloadData()}>
      <Download />
    </SSGDataProvider>
  )
}

export async function BlogPage() {
  return (
    <SSGDataProvider value={await loadBlogPosts()}>
      {/* Blog reads ?category= via useSearchParams, which needs a boundary in static export. */}
      <Suspense>
        <Blog />
      </Suspense>
    </SSGDataProvider>
  )
}

export async function ChangelogPage() {
  return (
    <SSGDataProvider value={await loadChangelog()}>
      <Changelog />
    </SSGDataProvider>
  )
}
