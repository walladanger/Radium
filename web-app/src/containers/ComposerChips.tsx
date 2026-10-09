import { useState } from 'react'
import { IconBolt, IconMessageCode, IconPlus, IconTrash, IconX } from '@tabler/icons-react'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { cn } from '@/lib/utils'
import type { AgentSkill } from '@/services/agent/skills'
import { useComposerLayout, type ComposerChip } from '@/stores/composer-layout-store'
import { useSavedPrompts } from '@/stores/saved-prompts-store'

/** The same pill the model picker uses, so the toolbar reads as one family. */
const pillClass =
  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border bg-secondary/40 px-2.5 text-xs font-medium transition-colors duration-200 hover:bg-secondary/70'

function RemoveButton({ chip, label }: { chip: ComposerChip; label: string }) {
  const removeChip = useComposerLayout((state) => state.removeChip)
  return (
    <button
      type="button"
      aria-label={label}
      data-no-hover-glow
      className="-mr-1 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
      onClick={(event) => {
        event.stopPropagation()
        removeChip(chip)
      }}
    >
      <IconX size={12} />
    </button>
  )
}

function PromptsChip({
  currentText,
  onInsert,
}: {
  currentText: string
  onInsert: (text: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const prompts = useSavedPrompts((state) => state.prompts)
  const add = useSavedPrompts((state) => state.add)
  const remove = useSavedPrompts((state) => state.remove)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn(pillClass, 'pr-1.5')}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="composer-chip-prompts"
            data-no-hover-glow
            className="inline-flex items-center gap-1.5"
          >
            <IconMessageCode size={14} className="text-muted-foreground" />
            {t('chat:chips.prompts', { defaultValue: 'Prompts' })}
          </button>
        </PopoverTrigger>
        <RemoveButton
          chip="prompts"
          label={t('chat:chips.remove', { defaultValue: 'Remove from toolbar' })}
        />
      </div>
      <PopoverContent align="start" className="w-72 p-1.5">
        <div className="max-h-64 overflow-y-auto">
          {prompts.map((prompt) => (
            <div
              key={prompt.id}
              className="group flex items-center gap-1 rounded-lg hover:bg-accent"
            >
              <button
                type="button"
                data-no-hover-glow
                className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left"
                onClick={() => {
                  onInsert(prompt.text)
                  setOpen(false)
                }}
              >
                <div className="truncate text-xs font-medium">{prompt.title}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {prompt.text.trim()}
                </div>
              </button>
              <button
                type="button"
                aria-label={t('chat:chips.deletePrompt', { defaultValue: 'Delete prompt' })}
                data-no-hover-glow
                className="mr-1 hidden rounded-md p-1 text-muted-foreground hover:text-destructive group-hover:block"
                onClick={() => remove(prompt.id)}
              >
                <IconTrash size={13} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={!currentText.trim()}
          data-no-hover-glow
          className="mt-1 flex w-full items-center gap-1.5 rounded-lg border-t px-2 py-1.5 text-xs text-muted-foreground enabled:hover:bg-accent disabled:opacity-50"
          onClick={() => add('', currentText.trim())}
        >
          <IconPlus size={13} />
          {t('chat:chips.saveCurrent', { defaultValue: 'Save what I typed as a prompt' })}
        </button>
      </PopoverContent>
    </Popover>
  )
}

function SkillsChip({
  skills,
  selected,
  onPick,
}: {
  skills: AgentSkill[]
  selected: AgentSkill | null
  onPick: (skill: AgentSkill | null) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn(pillClass, 'pr-1.5', selected && 'border-primary/50 text-primary')}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="composer-chip-skills"
            data-no-hover-glow
            className="inline-flex items-center gap-1.5"
          >
            <IconBolt size={14} className="text-muted-foreground" />
            {selected
              ? selected.name
              : t('chat:chips.skills', { defaultValue: 'Skills' })}
          </button>
        </PopoverTrigger>
        <RemoveButton
          chip="skills"
          label={t('chat:chips.remove', { defaultValue: 'Remove from toolbar' })}
        />
      </div>
      <PopoverContent align="start" className="w-72 p-1.5">
        <div className="max-h-64 overflow-y-auto">
          {skills.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">
              {t('chat:chips.noSkills', {
                defaultValue: 'No skills are switched on. Turn some on under Plugins > Skills.',
              })}
            </p>
          )}
          {selected && (
            <button
              type="button"
              data-no-hover-glow
              className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
              onClick={() => {
                onPick(null)
                setOpen(false)
              }}
            >
              {t('chat:chips.clearSkill', { defaultValue: 'Don’t use a skill' })}
            </button>
          )}
          {skills.map((skill) => (
            <button
              key={skill.name}
              type="button"
              data-no-hover-glow
              className={cn(
                'w-full rounded-lg px-2 py-1.5 text-left hover:bg-accent',
                selected?.name === skill.name && 'bg-accent'
              )}
              onClick={() => {
                onPick(skill)
                setOpen(false)
              }}
            >
              <div className="truncate text-xs font-medium">{skill.name}</div>
              <div className="line-clamp-2 text-[11px] text-muted-foreground">
                {skill.description}
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** The feature chips the "+" menu added, as pills beside the model picker. */
export function ComposerChips({
  currentText,
  onInsertPrompt,
  skills,
  selectedSkill,
  onPickSkill,
}: {
  currentText: string
  onInsertPrompt: (text: string) => void
  skills: AgentSkill[]
  selectedSkill: AgentSkill | null
  onPickSkill: (skill: AgentSkill | null) => void
}) {
  const chips = useComposerLayout((state) => state.chips)
  return (
    <>
      {chips.includes('prompts') && (
        <PromptsChip currentText={currentText} onInsert={onInsertPrompt} />
      )}
      {chips.includes('skills') && (
        <SkillsChip skills={skills} selected={selectedSkill} onPick={onPickSkill} />
      )}
    </>
  )
}
