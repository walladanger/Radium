import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ProductionLog, ProductionLogFolder } from '../ProductionLog'
import { productionLog, captureAnnotation } from '@/lib/production-log'

vi.mock('@/lib/production-log', () => ({
  productionLog: { load: vi.fn(), chooseFolder: vi.fn(), save: vi.fn(), image: vi.fn() },
  captureAnnotation: vi.fn(), readAnnotationPng: vi.fn(),
}))
vi.mock('@/i18n/react-i18next-compat', () => ({ useTranslation: () => ({
  t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
}) }))
const folder = 'D:/DEBUGGING LOGS/Radium Production log'
const screenshot = 'data:image/png;base64,aW1hZ2U='
const entry = { id: 'entry-1', created_at: '2026-10-16T20:00:00Z', note: 'Fix the toolbar',
  page_url: 'https://example.org', screenshot: true, captured_at: '2026-10-16T19:59:00Z' }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(productionLog.load).mockResolvedValue({ folder, entries: [] })
  vi.mocked(productionLog.image).mockResolvedValue(screenshot)
  vi.mocked(productionLog.save).mockResolvedValue(entry)
  vi.mocked(captureAnnotation).mockResolvedValue({ dataUrl: screenshot, capturedAt: entry.captured_at })
})
afterEach(cleanup)

it('saves the frozen screenshot with its note and displays it inside that entry', async () => {
  render(<ProductionLog />)
  await screen.findByText(folder)
  fireEvent.change(screen.getByLabelText('Edit or memory note'), { target: { value: entry.note } })
  fireEvent.change(screen.getByLabelText('Page address (optional)'), { target: { value: entry.page_url } })
  fireEvent.click(screen.getByRole('button', { name: 'Capture screenshot' }))
  await screen.findByAltText('Screenshot ready to attach')
  fireEvent.click(screen.getByRole('button', { name: 'Save annotation' }))
  await screen.findByText('Annotation and screenshot saved together.')
  const saved = within(screen.getByRole('list', { name: 'Saved annotations' }))
  expect(saved.getByText(entry.note)).toBeInTheDocument()
  expect(await saved.findByAltText('Screenshot attached to this annotation')).toHaveAttribute('src', screenshot)
  expect(screen.getByLabelText('Edit or memory note')).toHaveValue('')
  expect(productionLog.save).toHaveBeenCalledWith(folder, entry.note, entry.page_url,
    { dataUrl: screenshot, capturedAt: entry.captured_at })
})

it('preserves note and screenshot after a failed write so it can be retried', async () => {
  vi.mocked(productionLog.save).mockRejectedValueOnce(new Error('Disk is full'))
  render(<ProductionLog />)
  await screen.findByText(folder)
  fireEvent.change(screen.getByLabelText('Edit or memory note'), { target: { value: 'Keep this draft' } })
  fireEvent.click(screen.getByRole('button', { name: 'Capture screenshot' }))
  await screen.findByAltText('Screenshot ready to attach')
  fireEvent.click(screen.getByRole('button', { name: 'Save annotation' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Disk is full')
  expect(screen.getByLabelText('Edit or memory note')).toHaveValue('Keep this draft')
  expect(screen.getByAltText('Screenshot ready to attach')).toHaveAttribute('src', screenshot)
  expect(within(screen.getByRole('list', { name: 'Saved annotations' })).queryByRole('listitem')).not.toBeInTheDocument()
})

it('keeps the current folder on picker cancellation and updates it on selection', async () => {
  vi.mocked(productionLog.chooseFolder).mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ folder: 'D:/another-log', entries: [] })
  render(<ProductionLogFolder />)
  await screen.findByText(folder)
  const choose = screen.getByRole('button', { name: 'Choose log folder' })
  fireEvent.click(choose)
  await waitFor(() => expect(choose).toBeEnabled())
  expect(screen.getByLabelText('Production log folder')).toHaveTextContent(folder)
  fireEvent.click(choose)
  expect(await screen.findByText('D:/another-log')).toBeInTheDocument()
})

it('supports notes without images and treats page content as plain text', async () => {
  const note = '<img src=x onerror=alert(1)> is text from the page'
  vi.mocked(productionLog.save).mockResolvedValueOnce({ ...entry, note, screenshot: false, captured_at: null })
  render(<ProductionLog />)
  await screen.findByText(folder)
  fireEvent.change(screen.getByLabelText('Edit or memory note'), { target: { value: note } })
  fireEvent.click(screen.getByRole('button', { name: 'Save annotation' }))
  await screen.findByText('Annotation and screenshot saved together.')
  expect(within(screen.getByRole('list')).getByText(note)).toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})
