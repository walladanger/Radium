import { beforeEach, describe, expect, it } from 'vitest'
import { useArtifactStore } from '../artifact-store'

const initialState = useArtifactStore.getState()

describe('useArtifactStore', () => {
  beforeEach(() => {
    useArtifactStore.setState(initialState, true)
  })

  it('has correct initial state', () => {
    const state = useArtifactStore.getState()
    expect(state.isOpen).toBe(false)
    expect(state.sourceId).toBeNull()
    expect(state.code).toBe('')
    expect(state.title).toBe('HTML')
    expect(state.streaming).toBe(false)
  })

  it('open() sets isOpen, sourceId, code, and streaming defaults to false', () => {
    useArtifactStore.getState().open('id-1', '<div>test</div>')
    const state = useArtifactStore.getState()
    expect(state.isOpen).toBe(true)
    expect(state.sourceId).toBe('id-1')
    expect(state.code).toBe('<div>test</div>')
    expect(state.streaming).toBe(false)
  })

  it('open() can set streaming to true', () => {
    useArtifactStore.getState().open('id-1', '<div>test</div>', true)
    const state = useArtifactStore.getState()
    expect(state.streaming).toBe(true)
  })

  it('update() is a no-op when the panel is closed', () => {
    const stateBefore = useArtifactStore.getState()
    useArtifactStore.getState().update('id-1', '<div>new</div>', true)
    const stateAfter = useArtifactStore.getState()
    expect(stateAfter).toBe(stateBefore)
  })

  it('update() is a no-op when sourceId differs', () => {
    useArtifactStore.getState().open('id-1', '<div>test</div>')
    const stateBefore = useArtifactStore.getState()
    useArtifactStore.getState().update('id-2', '<div>new</div>', true)
    const stateAfter = useArtifactStore.getState()
    expect(stateAfter).toBe(stateBefore)
  })

  it('update() with the bound sourceId changes code and streaming', () => {
    useArtifactStore.getState().open('id-1', '<div>test</div>')
    useArtifactStore.getState().update('id-1', '<div>new</div>', true)
    const state = useArtifactStore.getState()
    expect(state.code).toBe('<div>new</div>')
    expect(state.streaming).toBe(true)
  })

  it('update() with identical code and streaming undefined does not call set (state reference unchanged)', () => {
    useArtifactStore.getState().open('id-1', '<div>test</div>')
    const stateBefore = useArtifactStore.getState()
    useArtifactStore.getState().update('id-1', '<div>test</div>')
    const stateAfter = useArtifactStore.getState()
    expect(stateAfter).toBe(stateBefore)
  })

  it('close() resets isOpen, sourceId, code, streaming but keeps title', () => {
    useArtifactStore.getState().open('id-1', '<div>test</div>', true)
    useArtifactStore.getState().close()
    const state = useArtifactStore.getState()
    expect(state.isOpen).toBe(false)
    expect(state.sourceId).toBeNull()
    expect(state.code).toBe('')
    expect(state.streaming).toBe(false)
    expect(state.title).toBe('HTML')
  })
})
