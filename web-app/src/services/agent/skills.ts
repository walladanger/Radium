import { invoke } from '@tauri-apps/api/core'

export type AgentSkillPlatform = 'darwin' | 'win32' | 'linux'

export interface AgentSkill {
  name: string
  description: string
  version: string
  requiresTools: string[]
  requiresScripts: string[]
  dangerous: boolean
  platforms: AgentSkillPlatform[] | null
  enabled: boolean
  compatible: boolean
  reserved: boolean
  unavailableReasons: string[]
  /** Added or changed since the user last allowed it; not offered to the AI. */
  needsReview: boolean
  error: string | null
  // Organizing data (display only). Optional so rows from an older backend,
  // and test fixtures, still type-check; the backend always sends them.
  /** Folder below the skills root, `/`-separated: `logo` or `graphics/logo`. */
  path?: string
  /** The category folders around it, `/`-separated; empty at the root. */
  folder?: string
  creator?: string
  category?: string
  tags?: string[]
  source?: AgentSkillSource
  /** What the SKILL.md declares itself, as opposed to derived values. */
  declaredCreator?: string | null
  declaredCategory?: string | null
  declaredTags?: string[]
  /** Total bytes of the skill folder. */
  sizeBytes?: number
  fileCount?: number
  /** Length of the SKILL.md instructions, in characters. */
  instructionsChars?: number
  /** When the folder appeared, in ms since the Unix epoch, if known. */
  addedAt?: number | null
}

export type AgentSkillSource = 'bundled' | 'user'

/**
 * Creator, category and tags a user sets on their own skill, written into
 * its SKILL.md `metadata`. On update, a field left out keeps its value and an
 * empty one removes it.
 */
export interface AgentSkillOrganizationFields {
  creator?: string
  category?: string
  tags?: string[]
}

/** A file bundled with a skill besides SKILL.md, shown in Preview. */
export interface AgentSkillFile {
  path: string
  content: string
  /** Cut short for Preview because the file is large. */
  truncated: boolean
}

export interface AgentSkillDetail extends AgentSkill {
  body: string
  files: AgentSkillFile[]
}

export interface CreateAgentSkillRequest extends AgentSkillOrganizationFields {
  name: string
  description: string
  instructions: string
}

export interface UpdateAgentSkillRequest extends AgentSkillOrganizationFields {
  name: string
  description: string
  instructions: string
}

export function listAgentSkills(): Promise<AgentSkill[]> {
  return invoke<AgentSkill[]>('agent_list_skills')
}

export function getAgentSkill(name: string): Promise<AgentSkillDetail> {
  return invoke<AgentSkillDetail>('agent_get_skill', { name })
}

export function setAgentSkillEnabled(
  name: string,
  enabled: boolean
): Promise<void> {
  return invoke<void>('agent_set_skill_enabled', { name, enabled })
}

/** The user reviewed the skill and chose Allow: record it and switch it on. */
export function approveAgentSkill(name: string): Promise<AgentSkillDetail> {
  return invoke<AgentSkillDetail>('agent_approve_skill', { name })
}

export function createAgentSkill(
  request: CreateAgentSkillRequest
): Promise<AgentSkillDetail> {
  return invoke<AgentSkillDetail>('agent_create_skill', { request })
}

export function importAgentSkill(
  sourcePath: string
): Promise<AgentSkillDetail> {
  return invoke<AgentSkillDetail>('agent_import_skill', { sourcePath })
}

export function updateAgentSkill(
  request: UpdateAgentSkillRequest
): Promise<AgentSkillDetail> {
  return invoke<AgentSkillDetail>('agent_update_skill', { request })
}

export function exportAgentSkill(
  name: string,
  targetPath: string
): Promise<void> {
  return invoke<void>('agent_export_skill', { name, targetPath })
}

/**
 * `path` picks one copy when two folders share a name (see `AgentSkill.path`);
 * without it the copy that loaded is deleted.
 */
export function deleteAgentSkill(name: string, path?: string): Promise<void> {
  return invoke<void>(
    'agent_delete_skill',
    path === undefined ? { name } : { name, path }
  )
}

/**
 * Move a skill into a category folder (`graphics` or `graphics/logos`), or
 * back to the top level with an empty string.
 */
export function moveAgentSkill(
  name: string,
  category: string
): Promise<AgentSkillDetail> {
  return invoke<AgentSkillDetail>('agent_move_skill', { name, category })
}

export function refreshAgentSkills(): Promise<AgentSkill[]> {
  return invoke<AgentSkill[]>('agent_refresh_skills')
}
