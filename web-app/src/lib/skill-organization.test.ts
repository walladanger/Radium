import { describe, expect, it } from 'vitest'
import type { AgentSkill } from '@/services/agent/skills'
import {
  DEFAULT_SKILL_VIEW_PREFS,
  SKILL_VIEW_PREFS_KEY,
  declaredOrganization,
  filterSkills,
  formatSkillSize,
  groupSkills,
  knownCategories,
  knownFolders,
  organizationRequest,
  parseTagList,
  readSkillViewPrefs,
  skillCreator,
  skillSource,
  sortSkills,
  writeSkillViewPrefs,
} from './skill-organization'

const skill = (name: string, extra: Partial<AgentSkill> = {}): AgentSkill => ({
  name,
  description: `${name} description`,
  version: '1.0.0',
  requiresTools: [],
  requiresScripts: [],
  dangerous: false,
  platforms: null,
  enabled: true,
  compatible: true,
  reserved: false,
  unavailableReasons: [],
  error: null,
  ...extra,
})

const names = (skills: AgentSkill[]) => skills.map((entry) => entry.name)

describe('skill organization', () => {
  const cuda = skill('cuda', {
    reserved: true,
    creator: 'NVIDIA',
    category: 'Code & Dev',
    tags: ['gpu'],
    source: 'bundled',
    sizeBytes: 5000,
    addedAt: 10,
  })
  const pdf = skill('pdf', {
    reserved: true,
    creator: 'Anthropic',
    category: 'Productivity',
    source: 'bundled',
    sizeBytes: 9000,
    addedAt: 10,
  })
  const mine = skill('my-notes', {
    creator: 'User',
    category: 'Cooking',
    folder: 'home/kitchen',
    source: 'user',
    sizeBytes: 100,
    addedAt: 99,
  })
  const legacy = skill('legacy', { reserved: true })
  const all = [pdf, mine, legacy, cuda]

  it('falls back for rows from an older backend', () => {
    expect(skillCreator(legacy)).toBe('Unknown')
    expect(skillCreator(skill('x'))).toBe('User')
    expect(skillSource(legacy)).toBe('bundled')
    expect(skillSource(skill('x'))).toBe('user')
  })

  it('searches every word across name, creator, category, tags and folder', () => {
    expect(names(filterSkills(all, 'nvidia gpu'))).toEqual(['cuda'])
    expect(names(filterSkills(all, 'KITCHEN'))).toEqual(['my-notes'])
    expect(names(filterSkills(all, '  '))).toHaveLength(4)
    expect(filterSkills(all, 'nvidia kitchen')).toEqual([])
  })

  it('sorts by name, size, creator, category and recency', () => {
    expect(names(sortSkills(all, 'name-asc'))).toEqual([
      'cuda',
      'legacy',
      'my-notes',
      'pdf',
    ])
    expect(names(sortSkills(all, 'name-desc'))[0]).toBe('pdf')
    expect(names(sortSkills(all, 'size-desc'))).toEqual([
      'pdf',
      'cuda',
      'my-notes',
      'legacy',
    ])
    expect(names(sortSkills(all, 'size-asc'))[0]).toBe('legacy')
    expect(names(sortSkills(all, 'creator'))).toEqual([
      'pdf',
      'cuda',
      'legacy',
      'my-notes',
    ])
    // Fixed categories in their order, custom ones after, "Other" last.
    expect(names(sortSkills(all, 'category'))).toEqual([
      'cuda',
      'pdf',
      'my-notes',
      'legacy',
    ])
    expect(names(sortSkills(all, 'recent'))).toEqual([
      'my-notes',
      'cuda',
      'pdf',
      'legacy',
    ])
    expect(names(all)).toEqual(['pdf', 'my-notes', 'legacy', 'cuda'])
  })

  it('groups with readable group order and keeps the sort inside groups', () => {
    const sorted = sortSkills(all, 'name-asc')
    expect(groupSkills(sorted, 'none')).toEqual([
      { key: 'all', label: '', skills: sorted },
    ])
    expect(groupSkills(sorted, 'category').map((group) => group.key)).toEqual([
      'Code & Dev',
      'Productivity',
      'Cooking',
      'Other',
    ])
    expect(groupSkills(sorted, 'creator').map((group) => group.key)).toEqual([
      'User',
      'Anthropic',
      'NVIDIA',
      'Unknown',
    ])
    const bySource = groupSkills(sorted, 'source')
    expect(bySource.map((group) => group.key)).toEqual(['user', 'bundled'])
    expect(names(bySource[1].skills)).toEqual(['cuda', 'legacy', 'pdf'])
    expect(groupSkills(sorted, 'folder').map((group) => group.key)).toEqual([
      '',
      'home/kitchen',
    ])
  })

  it('suggests folders and categories', () => {
    expect(knownFolders(all)).toEqual(['home', 'home/kitchen'])
    const categories = knownCategories(all)
    expect(categories[0]).toBe('Code & Dev')
    expect(categories.at(-1)).toBe('Cooking')
    expect(categories.filter((entry) => entry === 'Other')).toHaveLength(1)
  })

  it('formats sizes and tag lists', () => {
    expect(formatSkillSize(undefined)).toBe('')
    expect(formatSkillSize(512)).toBe('512 B')
    expect(formatSkillSize(1536)).toBe('1.5 KB')
    expect(formatSkillSize(200 * 1024)).toBe('200 KB')
    expect(formatSkillSize(3 * 1024 * 1024)).toBe('3.0 MB')
    expect(parseTagList(' svg, logo ,SVG,, ')).toEqual(['svg', 'logo'])
  })

  it('builds organization request fields for create and update', () => {
    const draft = { creator: ' Ada ', category: '', tags: 'a, b' }
    expect(organizationRequest(draft, 'create')).toEqual({
      creator: 'Ada',
      tags: ['a', 'b'],
    })
    expect(organizationRequest(draft, 'update')).toEqual({
      creator: 'Ada',
      category: '',
      tags: ['a', 'b'],
    })
    expect(
      declaredOrganization(
        skill('x', { declaredCreator: 'Ada', declaredTags: ['a', 'b'] })
      )
    ).toEqual({ creator: 'Ada', category: '', tags: 'a, b' })
  })

  it('reads and writes view preferences defensively', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    }
    expect(readSkillViewPrefs(storage)).toEqual(DEFAULT_SKILL_VIEW_PREFS)

    writeSkillViewPrefs(
      {
        groupBy: 'creator',
        sortBy: 'size-desc',
        collapsed: { creator: ['NVIDIA'] },
      },
      storage
    )
    expect(readSkillViewPrefs(storage)).toEqual({
      groupBy: 'creator',
      sortBy: 'size-desc',
      collapsed: { creator: ['NVIDIA'] },
    })

    store.set(
      SKILL_VIEW_PREFS_KEY,
      JSON.stringify({
        groupBy: 'weird',
        sortBy: 3,
        collapsed: { bogus: ['x'], source: [1, 'user'] },
      })
    )
    expect(readSkillViewPrefs(storage)).toEqual({
      ...DEFAULT_SKILL_VIEW_PREFS,
      collapsed: { source: ['user'] },
    })

    store.set(SKILL_VIEW_PREFS_KEY, '{not json')
    expect(readSkillViewPrefs(storage)).toEqual(DEFAULT_SKILL_VIEW_PREFS)
    expect(() =>
      writeSkillViewPrefs(DEFAULT_SKILL_VIEW_PREFS, {
        setItem: () => {
          throw new Error('quota')
        },
      })
    ).not.toThrow()
  })
})
