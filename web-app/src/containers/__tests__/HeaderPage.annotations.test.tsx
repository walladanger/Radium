import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import HeaderPage from '../HeaderPage'
import { useWorkspacePanel } from '@/hooks/useWorkspacePanel'

vi.mock('@/i18n/react-i18next-compat', () => ({ useTranslation: () => ({
  t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
}) }))
afterEach(() => { cleanup(); useWorkspacePanel.getState().close(); useWorkspacePanel.getState().setProductionView('steps'); vi.unstubAllGlobals() })

it('opens the annotation log from the header while keeping the conversation mounted', () => {
  vi.stubGlobal('IS_TAURI', true)
  vi.stubGlobal('IS_IOS', false)
  vi.stubGlobal('IS_ANDROID', false)
  render(<HeaderPage><div>Current conversation</div></HeaderPage>)
  fireEvent.click(screen.getByRole('button', { name: 'Open annotation log' }))
  expect(useWorkspacePanel.getState().panel).toBe('production')
  expect(useWorkspacePanel.getState().productionView).toBe('annotations')
  expect(screen.getByText('Current conversation')).toBeInTheDocument()
})

it('keeps the annotation button out of onboarding headers', () => {
  render(<HeaderPage hideControls><div>Set up Radium</div></HeaderPage>)
  expect(screen.queryByRole('button', { name: 'Open annotation log' })).not.toBeInTheDocument()
  expect(screen.getByText('Set up Radium')).toBeInTheDocument()
})
