import { useMemo, useState } from 'react'
import { IconRefresh } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useAgentSkills } from '@/hooks/useAgentSkills'
import { useMessages } from '@/hooks/useMessages'
import { readAgentSkillName } from '@/lib/agent-skill-selection'
import { Chip } from '../Chip'
import { PanelBody } from '../Readout'
import type { BuiltinPanel } from '../registry'

/**
 * Skills: what is installed, what is switched on, and what has actually run.
 *
 * This is the panel that justifies the layer — it is a real working surface,
 * not a readout, and it needs nothing new from the backend. "Has run" is read
 * off the message store: a selected skill rides on user-message metadata
 * (`agent_skill_name`) so that send, regenerate, edit and restart all replay
 * it, which makes those messages the existing record of what fired. Counting
 * them here adds no tracking of its own.
 *
 * The count is per loaded thread, so it is labelled "this session" rather
 * than claimed as all-time. A skill with no record shows no chip at all
 * rather than "0 runs", which would assert it has never been used.
 */
function SkillsPanel() {
  const { skills, loading, error, load, setEnabled, approve } = useAgentSkills()
  const messages = useMessages((state) => state.messages)
  const [busy, setBusy] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const runsBySkill = useMemo(() => {
    const counts = new Map<string, number>()
    for (const thread of Object.values(messages)) {
      for (const message of thread) {
        const name = readAgentSkillName(
          (message.metadata ?? {}) as Record<string, unknown>
        )
        if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
      }
    }
    return counts
  }, [messages])

  const act = async (name: string, run: () => Promise<void>) => {
    setBusy(name)
    setFailure(null)
    try {
      await run()
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }

  return (
    <PanelBody
      loading={loading && skills.length === 0}
      empty={
        !loading && skills.length === 0 && !error
          ? 'No skills installed. Add one in Settings → Skills.'
          : null
      }
    >
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => void load(true)} disabled={loading}>
          <IconRefresh className="size-3.5" /> Rescan
        </Button>
        <div className="flex-1" />
        <span className="text-muted-foreground">
          {skills.filter((skill) => skill.enabled).length} of {skills.length} on
        </span>
      </div>

      {error && <div className="text-destructive">{error}</div>}
      {failure && <div className="text-destructive">{failure}</div>}

      {skills.map((skill) => {
        const runs = runsBySkill.get(skill.name)
        return (
          <div key={skill.name} className="space-y-1 rounded-md border border-border p-2">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold" title={skill.name}>
                {skill.name}
              </span>
              <div className="flex-1" />
              {skill.needsReview ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy === skill.name}
                  onClick={() => void act(skill.name, () => approve(skill.name))}
                >
                  Review and allow
                </Button>
              ) : (
                <Switch
                  aria-label={`Enable ${skill.name}`}
                  checked={skill.enabled}
                  disabled={!skill.compatible || busy === skill.name}
                  loading={busy === skill.name}
                  onCheckedChange={(next) =>
                    void act(skill.name, () => setEnabled(skill.name, next))
                  }
                />
              )}
            </div>

            {skill.description && (
              <div className="line-clamp-2 text-muted-foreground">{skill.description}</div>
            )}

            <div className="flex flex-wrap items-center gap-1">
              {skill.version && <Chip tone="muted">v{skill.version}</Chip>}
              {/* No chip at all when nothing has run: "0 runs" would claim
                  the skill has never been used, which this cannot know. */}
              {runs !== undefined && (
                <Chip>
                  {runs} {runs === 1 ? 'run' : 'runs'} this session
                </Chip>
              )}
              {skill.needsReview && <Chip tone="bad">needs review</Chip>}
              {skill.dangerous && <Chip tone="bad">dangerous</Chip>}
              {!skill.compatible && <Chip tone="bad">unavailable</Chip>}
              {skill.requiresTools.map((tool) => (
                <Chip key={tool} tone="muted">
                  needs {tool}
                </Chip>
              ))}
            </div>

            {skill.error && <div className="text-destructive">{skill.error}</div>}
            {!skill.compatible &&
              skill.unavailableReasons.map((reason, index) => (
                <div key={index} className="text-muted-foreground">
                  {reason}
                </div>
              ))}
          </div>
        )
      })}
    </PanelBody>
  )
}

export const panel: BuiltinPanel = {
  id: 'skills',
  name: 'Skills',
  component: SkillsPanel,
  defaultSize: { w: 5, h: 10 },
}
