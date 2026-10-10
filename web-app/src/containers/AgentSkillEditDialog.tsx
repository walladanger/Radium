import { useEffect, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { useTranslation } from '@/i18n/react-i18next-compat'
import {
  EMPTY_SKILL_ORGANIZATION,
  SKILL_CATEGORIES,
  declaredOrganization,
  organizationRequest,
} from '@/lib/skill-organization'
import { AgentSkillOrganizationFields } from './AgentSkillOrganizationFields'
import type {
  AgentSkillDetail,
  UpdateAgentSkillRequest,
} from '@/services/agent/skills'

type AgentSkillEditDialogProps = {
  skill: AgentSkillDetail | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: (request: UpdateAgentSkillRequest) => Promise<void>
  /** Category suggestions; defaults to the fixed list. */
  categories?: string[]
}

export function AgentSkillEditDialog({
  skill,
  open,
  onOpenChange,
  onUpdate,
  categories = [...SKILL_CATEGORIES],
}: AgentSkillEditDialogProps) {
  const { t } = useTranslation()
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [organization, setOrganization] = useState(EMPTY_SKILL_ORGANIZATION)
  const [submitting, setSubmitting] = useState(false)
  // An older backend does not report what the file declares; then the fields
  // are not sent, so an edit cannot wipe metadata it never showed.
  const canOrganize = skill?.declaredTags !== undefined

  useEffect(() => {
    if (!open || !skill) return
    setDescription(skill.description)
    setInstructions(skill.body)
    setOrganization(declaredOrganization(skill))
    setSubmitting(false)
  }, [open, skill])

  const submit = async () => {
    if (!skill) return
    setSubmitting(true)
    try {
      await onUpdate({
        name: skill.name,
        description: description.trim(),
        instructions: instructions.trim(),
        ...(canOrganize ? organizationRequest(organization, 'update') : {}),
      })
      onOpenChange(false)
    } catch (reason) {
      toast.error(String(reason))
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl lg:max-w-2xl xl:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('common:editSkill')}</DialogTitle>
          <DialogDescription>
            {t('common:editSkillDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="agent-skill-edit-name">
              {t('common:skillName')}
            </Label>
            <Input
              id="agent-skill-edit-name"
              value={skill?.name ?? ''}
              disabled
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-skill-edit-description">
              {t('common:description')}
            </Label>
            <Textarea
              id="agent-skill-edit-description"
              value={description}
              className="min-h-24 resize-none"
              disabled={submitting}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          {canOrganize && (
            <AgentSkillOrganizationFields
              idPrefix="agent-skill-edit"
              value={organization}
              categories={categories}
              disabled={submitting}
              onChange={setOrganization}
            />
          )}
          <div className="space-y-2">
            <Label htmlFor="agent-skill-edit-instructions">
              {t('common:instructions')}
            </Label>
            <Textarea
              id="agent-skill-edit-instructions"
              value={instructions}
              className="min-h-64 resize-y"
              disabled={submitting}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            {t('common:cancel')}
          </Button>
          <Button
            disabled={submitting || !description.trim() || !instructions.trim()}
            onClick={() => void submit()}
          >
            {t('common:save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
