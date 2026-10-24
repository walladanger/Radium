import type { MetaRecord } from 'nextra'

// Changelog entries render as standalone articles (no docs sidebar,
// breadcrumb, TOC or prev/next links). Nextra 2 expressed this with
// `type: 'page'` on the `*` fallback; in Nextra 4 a `type` on the fallback
// makes the folder claim every route as active, so use theme flags instead.
const meta: MetaRecord = {
  '*': {
    theme: {
      layout: 'default',
      sidebar: false,
      breadcrumb: false,
      pagination: false,
      toc: false,
    },
  },
}

export default meta
