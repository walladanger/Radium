'use client'

import { usePathname } from 'next/navigation'
import { SITE_URL } from '@/lib/site'
import {
  LinkedinShareButton,
  LinkedinIcon,
  TwitterShareButton,
  XIcon,
} from 'react-share'

const SocialShareButton = () => {
  const pathname = usePathname()
  // Share the canonical URL; it is known at build time, so no effect needed.
  const url = SITE_URL + pathname

  return (
    <div className="mt-4 space-x-2">
      <TwitterShareButton url={url}>
        <XIcon round size={38} />
      </TwitterShareButton>
      <LinkedinShareButton url={url}>
        <LinkedinIcon round size={38} />
      </LinkedinShareButton>
    </div>
  )
}

export default SocialShareButton
