import nextra from 'nextra'

const withNextra = nextra({
  // Pages live in src/content and are served by app/[[...mdxPath]].
  contentDirBasePath: '/',
  defaultShowCopyCode: true,
  latex: true,
  search: { codeblocks: false },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // docs/ is its own package (bun) inside the yarn monorepo; pin the root so
  // Turbopack and Nextra resolve files relative to docs/, not the repo root.
  turbopack: { root: import.meta.dirname },
  output: 'export',
  env: {
    GTM_ID: process.env.GTM_ID,
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
  },
  transpilePackages: ['@scalar', 'react-tweet'],
  images: {
    formats: ['image/webp'],
    unoptimized: true,
  },
}

export default withNextra(nextConfig)
