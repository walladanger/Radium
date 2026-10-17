import type { ReactNode } from 'react'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSkillDetail } from '@/services/agent/skills'
import type { DialogService } from '@/services/dialog/types'
import { seedServiceHub } from '@/test/service-hub'
import { SkillsPage } from './index'

const hookState = vi.hoisted(() => ({
  value: {} as {
    skills: AgentSkillDetail[]
    selected: AgentSkillDetail | null
    loading: boolean
    error: string | null
    load: ReturnType<typeof vi.fn>
    select: ReturnType<typeof vi.fn>
    setEnabled: ReturnType<typeof vi.fn>
    addCreated: ReturnType<typeof vi.fn>
    addImported: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
    move: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    exportSkill: ReturnType<typeof vi.fn>
  },
}))
const dialogOpen = vi.hoisted(() => vi.fn())
const navigate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: object) => config,
  useNavigate: () => navigate,
}))

vi.mock('@/containers/HeaderPage', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/hooks/useAgentSkills', () => ({
  useAgentSkills: () => hookState.value,
}))

vi.mock('@/i18n/react-i18next-compat', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
  }: {
    children: ReactNode
    onSelect: () => void
    disabled?: boolean
  }) => (
    <button disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@/containers/RenderMarkdown', () => ({
  RenderMarkdown: ({ content }: { content: string }) => <div>{content}</div>,
}))

const customSkill: AgentSkillDetail = {
  name: 'custom-skill',
  description: 'Custom skill',
  version: '1.0.0',
  requiresTools: [],
  requiresScripts: ['inspect.sh'],
  dangerous: true,
  platforms: null,
  enabled: true,
  compatible: true,
  reserved: false,
  unavailableReasons: [],
  error: null,
  body: '# Instructions',
}

describe('SkillsPage', () => {
  beforeEach(() => {
    localStorage.clear()
    dialogOpen.mockReset()
    navigate.mockReset()
    seedServiceHub({
      dialog: {
        open: dialogOpen,
      } as unknown as DialogService,
    })
    hookState.value = {
      skills: [customSkill],
      selected: customSkill,
      loading: false,
      error: null,
      load: vi.fn(),
      select: vi.fn(),
      setEnabled: vi.fn(),
      addCreated: vi.fn().mockResolvedValue(undefined),
      addImported: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      move: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      exportSkill: vi.fn().mockResolvedValue(true),
    }
  })

  it('offers skill upload and in-app skill creation', async () => {
    dialogOpen.mockResolvedValue('/tmp/imported.skill')
    render(<SkillsPage />)

    expect(
      screen.getByRole('button', { name: 'common:createNewSkill' })
    ).toBeInTheDocument()
    fireEvent.click(screen.getByText('common:uploadASkill'))
    fireEvent.click(
      screen.getByRole('button', { name: 'common:dropSkillToUpload' })
    )

    await waitFor(() =>
      expect(hookState.value.addImported).toHaveBeenCalledWith(
        '/tmp/imported.skill'
      )
    )

    fireEvent.click(screen.getByText('common:writeSkillInstructions'))
    expect(screen.getAllByText('common:writeSkillInstructions')).toHaveLength(2)
  })

  it('shows modular skill details without badges and confirms uninstall', () => {
    render(<SkillsPage />)

    expect(
      screen.getByRole('heading', { name: 'common:skillInstructions' })
    ).toBeInTheDocument()
    expect(screen.queryByText('common:dangerous')).not.toBeInTheDocument()
    expect(screen.queryByText('common:skillEnabled')).not.toBeInTheDocument()
    expect(screen.getAllByText('common:downloadSkill')).toHaveLength(1)
    expect(screen.getAllByText('common:editSkill')).toHaveLength(1)
    fireEvent.click(screen.getAllByText('common:uninstallSkill')[0])

    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByText('common:delete'))
    expect(hookState.value.remove).toHaveBeenCalledWith('custom-skill')
  })

  it('keeps malformed bundled skills visible and hides custom actions', () => {
    const malformed: AgentSkillDetail = {
      ...customSkill,
      name: 'bundled-skill',
      reserved: true,
      enabled: false,
      compatible: false,
      error: 'Invalid SKILL.md',
      body: '',
    }
    hookState.value = {
      ...hookState.value,
      skills: [malformed],
      selected: malformed,
    }

    render(<SkillsPage />)

    expect(screen.getAllByText('Invalid SKILL.md')).toHaveLength(2)
    expect(screen.queryByText('common:bundled')).not.toBeInTheDocument()
    expect(screen.queryByText('common:editSkill')).not.toBeInTheDocument()
    expect(screen.queryByText('common:uninstallSkill')).not.toBeInTheDocument()
    for (const button of screen.getAllByText('common:tryInChat')) {
      expect(button.closest('button')).toBeDisabled()
    }
  })

  it('updates the selected skill from its switch', async () => {
    hookState.value.setEnabled.mockResolvedValue(undefined)
    render(<SkillsPage />)

    fireEvent.click(screen.getByRole('switch', { name: 'common:enableSkill' }))

    await waitFor(() =>
      expect(hookState.value.setEnabled).toHaveBeenCalledWith(
        'custom-skill',
        false
      )
    )
  })

  it('opens a new chat with the selected skill', () => {
    render(<SkillsPage />)

    fireEvent.click(screen.getAllByText('common:tryInChat')[0])

    expect(navigate).toHaveBeenCalledWith({
      to: '/',
      search: { agentSkill: 'custom-skill' },
    })
  })

  it('opens Edit only for a custom skill', () => {
    render(<SkillsPage />)

    fireEvent.click(screen.getAllByText('common:editSkill')[0])

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByDisplayValue('custom-skill')).toBeDisabled()
  })

  it('opens Edit from the instructions card', () => {
    render(<SkillsPage />)

    const editButtons = screen.getAllByRole('button', {
      name: 'common:editSkill',
    })
    fireEvent.click(editButtons[editButtons.length - 1])

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  describe('organizing the list', () => {
    const nvidiaSkill: AgentSkillDetail = {
      ...customSkill,
      name: 'cuda-kernels',
      description: 'Write CUDA kernels',
      reserved: true,
      creator: 'NVIDIA',
      category: 'Code & Dev',
      tags: ['gpu'],
      source: 'bundled',
      path: 'cuda-kernels',
      folder: '',
      sizeBytes: 50_000,
    }
    const logoSkill: AgentSkillDetail = {
      ...customSkill,
      name: 'logo-maker',
      description: 'Draw logos',
      creator: 'User',
      category: 'Graphics & Design',
      source: 'user',
      path: 'graphics/logo-maker',
      folder: 'graphics',
      sizeBytes: 900,
    }

    beforeEach(() => {
      hookState.value = {
        ...hookState.value,
        skills: [logoSkill, nvidiaSkill],
        selected: logoSkill,
      }
    })

    const groupHeadings = () =>
      screen
        .getAllByRole('button', { expanded: true })
        .concat(screen.queryAllByRole('button', { expanded: false }))
        .map((button) => button.textContent)

    it('groups by category by default, in the fixed category order', () => {
      render(<SkillsPage />)
      expect(groupHeadings()).toEqual(['Code & Dev1', 'Graphics & Design1'])
    })

    it('groups by creator and remembers the choice', () => {
      const { unmount } = render(<SkillsPage />)
      fireEvent.change(screen.getByLabelText('common:skillGroupBy'), {
        target: { value: 'creator' },
      })
      expect(screen.getByRole('region', { name: 'NVIDIA' })).toBeInTheDocument()
      unmount()

      render(<SkillsPage />)
      expect(screen.getByLabelText('common:skillGroupBy')).toHaveValue(
        'creator'
      )
      expect(
        JSON.parse(localStorage.getItem('radium.skills.view') ?? '{}').groupBy
      ).toBe('creator')
    })

    it('collapses a group and shows its count', () => {
      render(<SkillsPage />)
      const region = screen.getByRole('region', { name: 'Code & Dev' })
      const heading = within(region).getByRole('button', { expanded: true })
      expect(heading).toHaveTextContent('1')
      expect(screen.getAllByText('cuda-kernels').length).toBeGreaterThan(0)

      fireEvent.click(heading)

      expect(heading).toHaveAttribute('aria-expanded', 'false')
      expect(within(region).queryByText('cuda-kernels')).not.toBeInTheDocument()
    })

    it('sorts by size within an ungrouped list', () => {
      render(<SkillsPage />)
      fireEvent.change(screen.getByLabelText('common:skillGroupBy'), {
        target: { value: 'none' },
      })
      fireEvent.change(screen.getByLabelText('common:skillSortBy'), {
        target: { value: 'size-desc' },
      })
      const names = screen
        .getAllByText(/^(cuda-kernels|logo-maker)$/)
        .map((node) => node.textContent)
      expect(names.indexOf('cuda-kernels')).toBeLessThan(
        names.indexOf('logo-maker')
      )
    })

    it('filters by creator, category or tag', () => {
      render(<SkillsPage />)
      fireEvent.change(screen.getByLabelText('common:skillSearchPlaceholder'), {
        target: { value: 'gpu' },
      })
      expect(groupHeadings()).toEqual(['Code & Dev1'])

      fireEvent.change(screen.getByLabelText('common:skillSearchPlaceholder'), {
        target: { value: 'nothing-like-this' },
      })
      expect(screen.getByText('common:skillNoMatches')).toBeInTheDocument()
    })

    it('deletes the copy at its folder and moves a skill to another folder', async () => {
      render(<SkillsPage />)
      fireEvent.change(screen.getByLabelText('common:skillSearchPlaceholder'), {
        target: { value: 'logo' },
      })
      fireEvent.click(screen.getAllByText('common:moveSkillToFolder')[0])
      const dialog = screen.getByRole('dialog')
      const input = within(dialog).getByDisplayValue('graphics')
      fireEvent.change(input, { target: { value: 'design/logos' } })
      fireEvent.click(within(dialog).getByText('common:moveSkill'))
      await waitFor(() =>
        expect(hookState.value.move).toHaveBeenCalledWith(
          'logo-maker',
          'design/logos'
        )
      )

      fireEvent.click(screen.getAllByText('common:uninstallSkill')[0])
      fireEvent.click(
        within(screen.getByRole('dialog')).getByText('common:delete')
      )
      expect(hookState.value.remove).toHaveBeenCalledWith(
        'logo-maker',
        'graphics/logo-maker'
      )
    })
  })
})
