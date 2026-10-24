'use client'

import { useMemo, useState } from 'react'
import { FaWindows, FaApple, FaLinux } from 'react-icons/fa'
import { IconType } from 'react-icons/lib'
import { IoChevronDownOutline } from 'react-icons/io5'
import { useClickOutside } from '@/hooks/useClickOutside'
import { twMerge } from 'tailwind-merge'
import { formatFileSize } from '@/utils/format'
import { usePlatform, type Platform } from '@/hooks/usePlatform'

type Props = {
  lastRelease: any
}

type SystemType = {
  name: string
  logo: IconType
  fileFormat: string
  href?: string
  size?: string
}

const systemsTemplate: SystemType[] = [
  {
    name: 'Download for Mac',
    logo: FaApple,
    fileFormat: 'Jan_{tag}_universal.dmg',
  },
  {
    name: 'Download for Windows',
    logo: FaWindows,
    fileFormat: 'Jan_{tag}_x64-setup.exe',
  },
  {
    name: 'Download for Linux (AppImage)',
    logo: FaLinux,
    fileFormat: 'Jan_{tag}_amd64.AppImage',
  },
  {
    name: 'Download for Linux (deb)',
    logo: FaLinux,
    fileFormat: 'Jan_{tag}_amd64.deb',
  },
]

/** Fills in each system's download link and size from the latest release. */
function withReleaseLinks(lastRelease: any): SystemType[] {
  if (!lastRelease?.tag_name) return systemsTemplate
  const tag = lastRelease.tag_name.startsWith('v')
    ? lastRelease.tag_name.substring(1)
    : lastRelease.tag_name
  return systemsTemplate.map((system) => {
    const fileName = system.fileFormat.replace('{tag}', tag)
    const asset = lastRelease.assets?.find(
      (asset: any) => asset.name === fileName
    )
    return {
      ...system,
      href: `https://github.com/janhq/jan/releases/download/${lastRelease.tag_name}/${fileName}`,
      size: asset ? formatFileSize(asset.size) : undefined,
    }
  })
}

// Index into systemsTemplate offered as the main button for each OS.
const DEFAULT_SYSTEM_INDEX: Record<Platform, number> = {
  mac: 0,
  windows: 1,
  linux: 3,
}

const DropdownDownload = ({ lastRelease }: Props) => {
  const systems = useMemo(() => withReleaseLinks(lastRelease), [lastRelease])
  const defaultSystem = systems[DEFAULT_SYSTEM_INDEX[usePlatform()]]
  const [open, setOpen] = useState(false)

  const [menu, setMenu] = useState<HTMLButtonElement | null>(null)

  const [refDropdownContent, setRefDropdownContent] =
    useState<HTMLDivElement | null>(null)
  useClickOutside(() => setOpen(false), null, [menu, refDropdownContent])

  return (
    <div className="inline-flex shrink-0 justify-center relative">
      <a
        href={defaultSystem.href}
        className="min-w-[300px] dark:border-r-0 dark:nx-bg-neutral-900 dark:text-white bg-black text-white hover:text-white dark:border dark:border-neutral-800 shrink-0 pl-4 pr-6 py-4 rounded-l-xl inline-flex items-center rounded-r-none!"
      >
        <defaultSystem.logo className="h-4 mr-2" />
        <span>{defaultSystem.name}</span>
        {defaultSystem.size && (
          <span className="text-white/60 text-sm ml-2">
            ({defaultSystem.size})
          </span>
        )}
      </a>
      <button
        className="dark:nx-bg-neutral-900 dark:text-white bg-black text-white hover:text-white justify-center dark:border border-l border-gray-500 dark:border-neutral-800 shrink-0 p-4 px-3 rounded-r-xl"
        onClick={() => setOpen(!open)}
        ref={setMenu}
      >
        <IoChevronDownOutline
          className={twMerge(open && 'rotate-180 transition-all')}
        />
      </button>
      {open && (
        <div
          className="absolute left-0 top-[64px] w-full dark:nx-bg-neutral-900 bg-black z-30 rounded-xl lg:w-[380px]"
          ref={setRefDropdownContent}
        >
          {systems.map((system) => (
            <div key={system.name} className="py-1">
              <a
                href={system.href || ''}
                className="flex px-4 py-3 items-center text-white hover:text-white hover:bg-white/10 dark:hover:bg-white/5 justify-between"
                onClick={() => setOpen(false)}
              >
                <div className="flex items-center">
                  <system.logo className="w-3 mr-3 -mt-1 shrink-0" />
                  <span className="text-white font-medium flex-1">
                    {system.name}
                  </span>
                </div>
                {system.size && (
                  <span className="text-white/60 text-sm ml-2">
                    {system.size}
                  </span>
                )}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default DropdownDownload
