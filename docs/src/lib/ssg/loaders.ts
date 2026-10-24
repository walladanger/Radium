import 'server-only'

import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'

const CONTENT_DIR = path.join(process.cwd(), 'src/content')
const GITHUB_REPO_API = 'https://api.github.com/repos/janhq/jan'

async function getJson(url: string) {
  const res = await fetch(url, { cache: 'force-cache' })
  return res.json()
}

async function readFrontmatter(dir: string) {
  const files = (await fs.readdir(path.join(CONTENT_DIR, dir))).filter(
    (file) =>
      path.extname(file).toLowerCase() === '.mdx' && !file.startsWith('index')
  )
  return Promise.all(
    files.map(async (file) => ({
      file,
      data: matter(await fs.readFile(path.join(CONTENT_DIR, dir, file), 'utf8'))
        .data,
    }))
  )
}

const byDateDesc = (a: { date: string }, b: { date: string }) =>
  new Date(b.date).getTime() - new Date(a.date).getTime()

export async function loadHomeData() {
  const [latestRelease, release, repo] = await Promise.all([
    getJson(`${GITHUB_REPO_API}/releases/latest`),
    getJson(`${GITHUB_REPO_API}/releases?per_page=500`),
    getJson(GITHUB_REPO_API),
  ])
  return {
    stars: repo.stargazers_count || 2000,
    lastRelease: latestRelease,
    release,
    lastVersion: latestRelease.tag_name || 'v.0.0.1',
  }
}

export async function loadDownloadData() {
  return { lastRelease: await getJson(`${GITHUB_REPO_API}/releases/latest`) }
}

export async function loadBlogPosts() {
  return (await readFrontmatter('post'))
    .filter(({ data }) => !data.unlisted)
    .map(({ file, data }) => ({
      title: data?.title || null,
      url: '/post/' + file.replace(/\.mdx?/, ''),
      description: data?.description || null,
      date: String(data?.date),
      tags: data.tags?.split(', ') || null,
      author: data?.author || null,
      categories: data.categories?.split(', ') || null,
    }))
    .sort(byDateDesc)
}

export async function loadChangelog() {
  return (await readFrontmatter('changelog'))
    .filter(({ data }) => !data.unlisted)
    .map(({ file, data }) => ({
      url: file.replace('.mdx', ''),
      title: data?.title || '',
      ogImage: data?.ogImage || null,
      version: data?.version || null,
      description: data?.description || null,
      date: String(data?.date),
    }))
    .sort(byDateDesc)
}
