import * as React from 'react'

// Kept apart from sidebar.tsx so that file exports only components.

export type SidebarContext = {
  state: 'expanded' | 'collapsed'
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
  //* new properties for sidebar resizing
  width: string
  setWidth: (width: string) => void
  //* new properties for tracking is dragging rail
  isDraggingRail: boolean
  setIsDraggingRail: (isDraggingRail: boolean) => void
}

export const SidebarContext = React.createContext<SidebarContext | null>(null)

export function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.')
  }

  return context
}
