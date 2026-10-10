import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/i18n/react-i18next-compat'
import type { SkillOrganizationDraft } from '@/lib/skill-organization'

type Props = {
  idPrefix: string
  value: SkillOrganizationDraft
  categories: string[]
  disabled?: boolean
  onChange: (value: SkillOrganizationDraft) => void
}

/**
 * Creator, category and tags for a user's own skill. Stored in the SKILL.md
 * `metadata` map; the category can be one of the fixed ones or any wording.
 */
export function AgentSkillOrganizationFields({
  idPrefix,
  value,
  categories,
  disabled,
  onChange,
}: Props) {
  const { t } = useTranslation()
  const listId = useId()
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-category`}>
          {t('common:skillCategory')}
        </Label>
        <Input
          id={`${idPrefix}-category`}
          value={value.category}
          list={listId}
          placeholder={t('common:skillCategoryPlaceholder')}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, category: event.target.value })
          }
        />
        <datalist id={listId}>
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-creator`}>
          {t('common:skillCreator')}
        </Label>
        <Input
          id={`${idPrefix}-creator`}
          value={value.creator}
          placeholder={t('common:skillCreatorPlaceholder')}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, creator: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-tags`}>{t('common:skillTags')}</Label>
        <Input
          id={`${idPrefix}-tags`}
          value={value.tags}
          placeholder={t('common:skillTagsPlaceholder')}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, tags: event.target.value })}
        />
      </div>
    </div>
  )
}
