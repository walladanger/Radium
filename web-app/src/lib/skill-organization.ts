import type { AgentSkill } from '@/services/agent/skills'

/**
 * Arranging the skills list: search, group and sort. Pure functions over the
 * rows the backend lists, so the page stays a thin view and this is tested on
 * its own. A skill's identity is its `name`; everything here is display only.
 */

/** Mirrors SKILL_CATEGORIES in src-tauri/src/core/agent/skills/organization.rs. */
export const SKILL_CATEGORIES = [
  'Code & Dev',
  'AI & Machine Learning',
  'Data & Science',
  'Infrastructure & Hardware',
  'Robotics & Simulation',
  'Health & Life Sciences',
  'Graphics & Design',
  'Media',
  'Writing & Communication',
  'Productivity',
  'Other',
] as const

export const SKILL_GROUP_BY = [
  'none',
  'creator',
  'category',
  'source',
  'folder',
] as const
export type SkillGroupBy = (typeof SKILL_GROUP_BY)[number]

export const SKILL_SORT_BY = [
  'name-asc',
  'name-desc',
  'size-desc',
  'size-asc',
  'creator',
  'category',
  'recent',
] as const
export type SkillSortBy = (typeof SKILL_SORT_BY)[number]

export interface SkillViewPrefs {
  groupBy: SkillGroupBy
  sortBy: SkillSortBy
  /** Group keys the user has folded away, per grouping. */
  collapsed: Partial<Record<SkillGroupBy, string[]>>
}

export const DEFAULT_SKILL_VIEW_PREFS: SkillViewPrefs = {
  groupBy: 'category',
  sortBy: 'name-asc',
  collapsed: {},
}

export const SKILL_VIEW_PREFS_KEY = 'radium.skills.view'

export interface SkillGroup<T extends AgentSkill = AgentSkill> {
  /** Stable id for the group (also what `collapsed` stores). */
  key: string
  /** Heading shown to the user; empty for the single ungrouped list. */
  label: string
  skills: T[]
}

const OTHER = 'Other'
const UNKNOWN = 'Unknown'
const TOP_LEVEL = ''

export function skillCreator(skill: AgentSkill): string {
  return skill.creator?.trim() || (skill.reserved ? UNKNOWN : 'User')
}

export function skillCategory(skill: AgentSkill): string {
  return skill.category?.trim() || OTHER
}

export function skillSource(skill: AgentSkill): 'bundled' | 'user' {
  return skill.source ?? (skill.reserved ? 'bundled' : 'user')
}

/** Every search word must appear in the name, description, creator, category, tags or folder. */
export function filterSkills<T extends AgentSkill>(
  skills: T[],
  query: string
): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return skills
  return skills.filter((skill) => {
    const haystack = [
      skill.name,
      skill.description,
      skill.error ?? '',
      skillCreator(skill),
      skillCategory(skill),
      skill.folder ?? '',
      ...(skill.tags ?? []),
    ]
      .join('\n')
      .toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

const byName = (left: AgentSkill, right: AgentSkill) =>
  left.name.localeCompare(right.name) ||
  (left.path ?? '').localeCompare(right.path ?? '')

export function sortSkills<T extends AgentSkill>(
  skills: T[],
  sortBy: SkillSortBy
): T[] {
  const sorted = [...skills]
  const size = (skill: AgentSkill) => skill.sizeBytes ?? 0
  switch (sortBy) {
    case 'name-desc':
      return sorted.sort((left, right) => byName(right, left))
    case 'size-desc':
      return sorted.sort(
        (left, right) => size(right) - size(left) || byName(left, right)
      )
    case 'size-asc':
      return sorted.sort(
        (left, right) => size(left) - size(right) || byName(left, right)
      )
    case 'creator':
      return sorted.sort(
        (left, right) =>
          skillCreator(left).localeCompare(skillCreator(right)) ||
          byName(left, right)
      )
    case 'category':
      return sorted.sort(
        (left, right) =>
          categoryOrder(skillCategory(left)) -
            categoryOrder(skillCategory(right)) ||
          skillCategory(left).localeCompare(skillCategory(right)) ||
          byName(left, right)
      )
    case 'recent':
      // Unknown dates go last; equal dates (bundled skills share an install
      // time) fall back to the name.
      return sorted.sort(
        (left, right) =>
          (right.addedAt ?? -1) - (left.addedAt ?? -1) || byName(left, right)
      )
    case 'name-asc':
    default:
      return sorted.sort(byName)
  }
}

/** Fixed categories in their listed order, then any custom ones, "Other" last. */
function categoryOrder(category: string): number {
  if (category === OTHER) return SKILL_CATEGORIES.length + 1
  const index = (SKILL_CATEGORIES as readonly string[]).indexOf(category)
  return index === -1 ? SKILL_CATEGORIES.length : index
}

function groupKey(skill: AgentSkill, groupBy: SkillGroupBy): string {
  switch (groupBy) {
    case 'creator':
      return skillCreator(skill)
    case 'category':
      return skillCategory(skill)
    case 'source':
      return skillSource(skill)
    case 'folder':
      return skill.folder ?? TOP_LEVEL
    case 'none':
    default:
      return 'all'
  }
}

/**
 * Group already-sorted skills, keeping their order inside each group. Groups
 * are ordered for reading: categories in the fixed order, creators and
 * folders alphabetically with the catch-alls ("Unknown", top level) placed
 * where they are least in the way, and your own skills before bundled ones.
 */
export function groupSkills<T extends AgentSkill>(
  skills: T[],
  groupBy: SkillGroupBy
): SkillGroup<T>[] {
  if (groupBy === 'none') {
    return [{ key: 'all', label: '', skills }]
  }
  const groups = new Map<string, T[]>()
  for (const skill of skills) {
    const key = groupKey(skill, groupBy)
    const members = groups.get(key)
    if (members) members.push(skill)
    else groups.set(key, [skill])
  }
  const keys = [...groups.keys()]
  keys.sort((left, right) => compareGroupKeys(left, right, groupBy))
  return keys.map((key) => ({
    key,
    label: key,
    skills: groups.get(key) ?? [],
  }))
}

function compareGroupKeys(
  left: string,
  right: string,
  groupBy: SkillGroupBy
): number {
  switch (groupBy) {
    case 'category':
      return (
        categoryOrder(left) - categoryOrder(right) || left.localeCompare(right)
      )
    case 'creator': {
      const rank = (key: string) =>
        key === UNKNOWN ? 2 : key === 'User' ? 0 : 1
      return rank(left) - rank(right) || left.localeCompare(right)
    }
    case 'source':
      return (left === 'user' ? 0 : 1) - (right === 'user' ? 0 : 1)
    case 'folder':
      // Top level first, then folders as paths.
      return (
        (left === TOP_LEVEL ? 0 : 1) - (right === TOP_LEVEL ? 0 : 1) ||
        left.localeCompare(right)
      )
    default:
      return left.localeCompare(right)
  }
}

/** Distinct category folders in use, for the "Move to folder" suggestions. */
export function knownFolders(skills: AgentSkill[]): string[] {
  const folders = new Set<string>()
  for (const skill of skills) {
    const parts = (skill.folder ?? '').split('/').filter(Boolean)
    for (let depth = 1; depth <= parts.length; depth += 1) {
      folders.add(parts.slice(0, depth).join('/'))
    }
  }
  return [...folders].sort((left, right) => left.localeCompare(right))
}

/** Distinct categories in use plus the fixed list, fixed ones first. */
export function knownCategories(skills: AgentSkill[]): string[] {
  const custom = new Set<string>()
  for (const skill of skills) {
    const category = skillCategory(skill)
    if (!(SKILL_CATEGORIES as readonly string[]).includes(category)) {
      custom.add(category)
    }
  }
  return [
    ...SKILL_CATEGORIES,
    ...[...custom].sort((left, right) => left.localeCompare(right)),
  ]
}

export function formatSkillSize(bytes: number | undefined): string {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/** "svg, logo , SVG" → ["svg", "logo"]. */
export function parseTagList(value: string): string[] {
  const tags: string[] = []
  for (const raw of value.split(',')) {
    const tag = raw.trim()
    if (
      tag &&
      !tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())
    ) {
      tags.push(tag)
    }
  }
  return tags
}

function isOneOf<T extends string>(
  value: unknown,
  options: readonly T[]
): value is T {
  return (
    typeof value === 'string' && (options as readonly string[]).includes(value)
  )
}

export function readSkillViewPrefs(
  storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage
): SkillViewPrefs {
  try {
    const raw = storage?.getItem(SKILL_VIEW_PREFS_KEY)
    if (!raw) return DEFAULT_SKILL_VIEW_PREFS
    const parsed = JSON.parse(raw) as Partial<SkillViewPrefs>
    const collapsed: SkillViewPrefs['collapsed'] = {}
    if (parsed.collapsed && typeof parsed.collapsed === 'object') {
      for (const [groupBy, keys] of Object.entries(parsed.collapsed)) {
        if (isOneOf(groupBy, SKILL_GROUP_BY) && Array.isArray(keys)) {
          collapsed[groupBy] = keys.filter(
            (key): key is string => typeof key === 'string'
          )
        }
      }
    }
    return {
      groupBy: isOneOf(parsed.groupBy, SKILL_GROUP_BY)
        ? parsed.groupBy
        : DEFAULT_SKILL_VIEW_PREFS.groupBy,
      sortBy: isOneOf(parsed.sortBy, SKILL_SORT_BY)
        ? parsed.sortBy
        : DEFAULT_SKILL_VIEW_PREFS.sortBy,
      collapsed,
    }
  } catch {
    return DEFAULT_SKILL_VIEW_PREFS
  }
}

export function writeSkillViewPrefs(
  prefs: SkillViewPrefs,
  storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage
): void {
  try {
    storage?.setItem(SKILL_VIEW_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Private mode or a full quota: the view still works, it just is not kept.
  }
}

/** The organizing fields of the create and edit forms, as typed. */
export type SkillOrganizationDraft = {
  creator: string
  category: string
  /** Comma-separated. */
  tags: string
}

export const EMPTY_SKILL_ORGANIZATION: SkillOrganizationDraft = {
  creator: '',
  category: '',
  tags: '',
}

/** What the SKILL.md itself declares, for prefilling the edit form. */
export function declaredOrganization(
  skill: AgentSkill
): SkillOrganizationDraft {
  return {
    creator: skill.declaredCreator ?? '',
    category: skill.declaredCategory ?? '',
    tags: (skill.declaredTags ?? []).join(', '),
  }
}

/**
 * The request fields for a draft. For a new skill, empty fields are left out;
 * for an edit, every field is sent so clearing one removes it from the file.
 */
export function organizationRequest(
  draft: SkillOrganizationDraft,
  mode: 'create' | 'update'
): { creator?: string; category?: string; tags?: string[] } {
  const creator = draft.creator.trim()
  const category = draft.category.trim()
  const tags = parseTagList(draft.tags)
  if (mode === 'update') return { creator, category, tags }
  return {
    ...(creator ? { creator } : {}),
    ...(category ? { category } : {}),
    ...(tags.length > 0 ? { tags } : {}),
  }
}
