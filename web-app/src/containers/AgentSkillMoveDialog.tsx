import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/i18n/react-i18next-compat'
import type { AgentSkill } from '@/services/agent/skills'

type AgentSkillMoveDialogProps = {
  /** The skill to move; the dialog is open while this is set. */
  skill: AgentSkill | null
  /** Category folders already in use, offered as suggestions. */
  folders: string[]
  onOpenChange: (open: boolean) => void
  onMove: (category: string) => Promise<void>
}

/**
 * Move a skill into a category folder inside the skills folder (or back to
 * the top level). The skill keeps its name, its on/off state and its review.
 */
export function AgentSkillMoveDialog({
  skill,
  folders,
  onOpenChange,
  onMove,
}: AgentSkillMoveDialogProps) {
  const { t } = useTranslation()
  const listId = useId()
  const [folder, setFolder] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (skill) {
      setFolder(skill.folder ?? '')
      setSubmitting(false)
    }
  }, [skill])

  const submit = async () => {
    setSubmitting(true)
    try {
      await onMove(folder.trim())
      onOpenChange(false)
    } catch (reason) {
      toast.error(String(reason))
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={skill !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('common:moveSkillTitle')}</DialogTitle>
          <DialogDescription>
            {t('common:moveSkillDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="agent-skill-move-folder">
            {t('common:moveSkillFolder')}
          </Label>
          <Input
            id="agent-skill-move-folder"
            value={folder}
            list={listId}
            placeholder="graphics/logos"
            disabled={submitting}
            onChange={(event) => setFolder(event.target.value)}
          />
          <datalist id={listId}>
            {folders.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            {t('common:cancel')}
          </Button>
          <Button disabled={submitting} onClick={() => void submit()}>
            {t('common:moveSkill')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
