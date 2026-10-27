import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DefaultProjectsService } from '../projects/default'
import { localStorageKey } from '@/constants/localStorage'
import { ulid } from 'ulidx'

vi.mock('ulidx', () => ({
  ulid: vi.fn(),
}))

describe('DefaultProjectsService', () => {
  let service: DefaultProjectsService

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    service = new DefaultProjectsService()

    // Setup deterministic ulid sequence
    let count = 0
    vi.mocked(ulid).mockImplementation(() => `ulid-mock-${++count}`)

    // Setup a deterministic Date.now for testing
    vi.spyOn(Date, 'now').mockReturnValue(1000000)
  })

  it('getProjects returns empty array when storage is empty', async () => {
    const projects = await service.getProjects()
    expect(projects).toEqual([])
  })

  it('getProjects returns empty array when storage holds malformed JSON', async () => {
    localStorage.setItem(localStorageKey.threadManagement, '{malformed: "json"')
    const projects = await service.getProjects()
    expect(projects).toEqual([])
  })

  it('addProject creates a new project and saves to localStorage', async () => {
    const project = await service.addProject('Test Project', 'assistant-1')

    expect(project).toStrictEqual({
      id: 'ulid-mock-1',
      name: 'Test Project',
      updated_at: 1000000,
      assistantId: 'assistant-1'
    })

    const storedData = JSON.parse(localStorage.getItem(localStorageKey.threadManagement)!)
    expect(storedData).toStrictEqual({
      state: {
        folders: [
          {
            id: 'ulid-mock-1',
            name: 'Test Project',
            updated_at: 1000000,
            assistantId: 'assistant-1'
          }
        ]
      },
      version: 0
    })
  })

  it('updateProject updates an existing project', async () => {
    await service.addProject('Project 1')
    await service.addProject('Project 2')

    vi.spyOn(Date, 'now').mockReturnValue(2000000)

    await service.updateProject('ulid-mock-1', 'Updated Project 1', 'assistant-new')

    const storedData = JSON.parse(localStorage.getItem(localStorageKey.threadManagement)!)
    expect(storedData.state.folders).toStrictEqual([
      {
        id: 'ulid-mock-1',
        name: 'Updated Project 1',
        updated_at: 2000000,
        assistantId: 'assistant-new'
      },
      {
        id: 'ulid-mock-2',
        name: 'Project 2',
        updated_at: 1000000
      }
    ])
  })

  it('deleteProject removes an existing project', async () => {
    await service.addProject('Project 1')
    await service.addProject('Project 2')

    await service.deleteProject('ulid-mock-1')

    const storedData = JSON.parse(localStorage.getItem(localStorageKey.threadManagement)!)
    expect(storedData.state.folders).toStrictEqual([
      {
        id: 'ulid-mock-2',
        name: 'Project 2',
        updated_at: 1000000
      }
    ])
  })

  it('getProjectById retrieves a project by its id', async () => {
    await service.addProject('Project 1')
    await service.addProject('Project 2')

    const project = await service.getProjectById('ulid-mock-2')
    expect(project).toStrictEqual({
      id: 'ulid-mock-2',
      name: 'Project 2',
      updated_at: 1000000
    })
  })

  it('getProjectById returns undefined for unknown id', async () => {
    await service.addProject('Project 1')
    const project = await service.getProjectById('unknown-id')
    expect(project).toBeUndefined()
  })

  it('setProjects bulk replaces the entire projects collection', async () => {
    const projects = [
      { id: '1', name: 'A', updated_at: 100, assistantId: 'a1' },
      { id: '2', name: 'B', updated_at: 200 }
    ]

    await service.setProjects(projects)

    const storedData = JSON.parse(localStorage.getItem(localStorageKey.threadManagement)!)
    expect(storedData.state.folders).toStrictEqual(projects)
  })
})
