import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import Script from 'next/script'
import { Layout } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import Navbar from '@/components/Navbar'
import FooterMenu from '@/components/FooterMenu'
import JSONLD from '@/components/JSONLD'
import { DEFAULT_DESCRIPTION, DEFAULT_KEYWORDS, SITE_URL } from '@/lib/site'

import 'nextra-theme-docs/style.css'
import '@/styles/main.css'

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Jan',
  url: SITE_URL,
  logo: `${SITE_URL}/assets/images/general/og-image.png`,
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Jan', template: '%s' },
  description: DEFAULT_DESCRIPTION,
  keywords: DEFAULT_KEYWORDS,
  other: { 'Content-Language': 'en' },
  twitter: { card: 'summary_large_image', site: '@jandotai' },
  openGraph: { type: 'website' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

const GTM_ID = process.env.GTM_ID

export default async function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      {/* Nextra 2's light theme used a pure white page background. */}
      <Head backgroundColor={{ light: '#ffffff' }}>
        <JSONLD data={structuredData} />
      </Head>
      <body>
        <Layout
          navbar={<Navbar />}
          footer={<FooterMenu />}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/janhq/jan/tree/dev/docs"
          editLink="Edit this page on GitHub →"
          feedback={{ content: 'Question? Give us feedback →', labels: 'feedback' }}
          sidebar={{ defaultMenuCollapseLevel: 1, autoCollapse: true }}
          toc={{ backToTop: true }}
          darkMode={false}
          nextThemes={{ defaultTheme: 'light', forcedTheme: 'light' }}
        >
          {children}
        </Layout>
        {GTM_ID && (
          <>
            <Script
              strategy="afterInteractive"
              src={`https://www.googletagmanager.com/gtag/js?id=${GTM_ID}`}
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GTM_ID}', { page_path: window.location.pathname });`}
            </Script>
          </>
        )}
      </body>
    </html>
  )
}
