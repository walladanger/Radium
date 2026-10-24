import type { Metadata } from 'next'
import { generateStaticParamsFor, importPage } from 'nextra/pages'
import { useMDXComponents as getMDXComponents } from '../../mdx-components'
import { DEFAULT_DESCRIPTION, SITE_URL } from '@/lib/site'

export const generateStaticParams = generateStaticParamsFor('mdxPath')

type PageProps = { params: Promise<{ mdxPath?: string[] }> }

function ogImageFor(pathname: string, ogImage?: string) {
  if (ogImage) return `${SITE_URL}/${ogImage.replace(/^\//, '')}`
  return pathname.startsWith('/docs')
    ? `${SITE_URL}/assets/images/general/og-image-docs.png`
    : `${SITE_URL}/assets/images/general/og-image.png`
}

// Custom front-matter fields (e.g. ogImage) are not part of Nextra's metadata type.
function frontmatterString(metadata: object, key: string) {
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { mdxPath = [] } = await props.params
  const { metadata } = await importPage(mdxPath)
  const pathname = '/' + mdxPath.join('/')
  const title = metadata.title || 'Jan'
  const description = metadata.description || DEFAULT_DESCRIPTION
  const url = `${SITE_URL}${pathname === '/' ? '' : pathname}`
  return {
    title,
    description,
    ...(Array.isArray(metadata.keywords) && { keywords: metadata.keywords }),
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      title,
      description,
      url,
      images: [{ url: ogImageFor(pathname, frontmatterString(metadata, 'ogImage')), alt: 'Jan-OGImage' }],
    },
  }
}

const Wrapper = getMDXComponents().wrapper

export default async function Page(props: PageProps) {
  const params = await props.params
  const { default: MDXContent, toc, metadata, sourceCode } = await importPage(
    params.mdxPath
  )
  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  )
}
