import type { MetaRecord } from 'nextra'

const meta: MetaRecord = {
  "index": {
    "type": "page",
    "title": "Homepage",
    "display": "hidden"
  },
  "docs": {
    "type": "page",
    "title": "Docs"
  },
  "handbook": {
    "type": "page",
    "title": "Handbook",
    "display": "hidden"
  },
  "changelog": {
    "type": "page",
    "title": "Changelog"
  },
  "blog": {
    "type": "page",
    "title": "Blog"
  },
  // Not hidden: in Nextra 4 a hidden folder also drops its sidebar, and
  // posts use theirs for the category links. The site's own <Navbar>
  // decides what shows in the top bar, so this adds no nav item.
  "post": {
    "type": "page",
    "title": "Post Categories"
  },
  "download": {
    "type": "page"
  },
  "privacy": {
    "title": "Privacy",
    "display": "hidden"
  },
  "support": {
    "title": "Support",
    "display": "hidden"
  }
}

export default meta
