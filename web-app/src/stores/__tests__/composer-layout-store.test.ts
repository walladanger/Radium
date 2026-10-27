import { beforeEach, describe, expect, it } from 'vitest'

import {
  COMPOSER_MAX_ROWS,
  COMPOSER_MAX_WIDTH,
  COMPOSER_MIN_ROWS,
  COMPOSER_MIN_WIDTH,
  MENU_MAX_HEIGHT,
  MENU_MIN_HEIGHT,
  MENU_DEFAULT_HEIGHT,
  useComposerLayout,
} from '../composer-layout-store'

const initialState = useComposerLayout.getState()

describe('composer-layout-store', () => {
  beforeEach(() => {
    localStorage.clear()
    useComposerLayout.setState(initialState, true)
  })

  it('starts with default bounds', () => {
    const state = useComposerLayout.getState()
    expect(state.width).toBeNull()
    expect(state.rows).toBe(COMPOSER_MIN_ROWS)
    expect(state.chips).toEqual([])
    expect(state.menuHeight).toBe(MENU_DEFAULT_HEIGHT)
  })

  it('setMenuHeight clamps below min', () => {
    useComposerLayout.getState().setMenuHeight(MENU_MIN_HEIGHT - 10)
    expect(useComposerLayout.getState().menuHeight).toBe(MENU_MIN_HEIGHT)
  })

  it('setMenuHeight clamps above max', () => {
    useComposerLayout.getState().setMenuHeight(MENU_MAX_HEIGHT + 10)
    expect(useComposerLayout.getState().menuHeight).toBe(MENU_MAX_HEIGHT)
  })

  it('setMenuHeight works in range and rounds', () => {
    useComposerLayout.getState().setMenuHeight(200.5)
    expect(useComposerLayout.getState().menuHeight).toBe(201)
  })

  it('setSize clamps width below min', () => {
    useComposerLayout.getState().setSize(COMPOSER_MIN_WIDTH - 10, 5)
    expect(useComposerLayout.getState().width).toBe(COMPOSER_MIN_WIDTH)
  })

  it('setSize clamps width above max', () => {
    useComposerLayout.getState().setSize(COMPOSER_MAX_WIDTH + 10, 5)
    expect(useComposerLayout.getState().width).toBe(COMPOSER_MAX_WIDTH)
  })

  it('setSize keeps width null if passed null', () => {
    useComposerLayout.getState().setSize(null, 5)
    expect(useComposerLayout.getState().width).toBeNull()
  })

  it('setSize clamps rows below min', () => {
    useComposerLayout.getState().setSize(500, COMPOSER_MIN_ROWS - 5)
    expect(useComposerLayout.getState().rows).toBe(COMPOSER_MIN_ROWS)
  })

  it('setSize clamps rows above max', () => {
    useComposerLayout.getState().setSize(500, COMPOSER_MAX_ROWS + 5)
    expect(useComposerLayout.getState().rows).toBe(COMPOSER_MAX_ROWS)
  })

  it('setSize works in range and rounds', () => {
    useComposerLayout.getState().setSize(500.2, 3.8)
    expect(useComposerLayout.getState().width).toBe(500)
    expect(useComposerLayout.getState().rows).toBe(4)
  })

  it('resetSize resets to defaults', () => {
    useComposerLayout.getState().setSize(500, 5)
    useComposerLayout.getState().resetSize()

    expect(useComposerLayout.getState().width).toBeNull()
    expect(useComposerLayout.getState().rows).toBe(COMPOSER_MIN_ROWS)
  })

  it('toggleChip adds a chip if not present', () => {
    useComposerLayout.getState().toggleChip('prompts')
    expect(useComposerLayout.getState().chips).toEqual(['prompts'])
  })

  it('toggleChip removes a chip if present', () => {
    useComposerLayout.getState().toggleChip('prompts')
    useComposerLayout.getState().toggleChip('prompts')
    expect(useComposerLayout.getState().chips).toEqual([])
  })

  it('removeChip removes a chip if present', () => {
    useComposerLayout.getState().toggleChip('skills')
    useComposerLayout.getState().removeChip('skills')
    expect(useComposerLayout.getState().chips).toEqual([])
  })

  it('persists state to localStorage', () => {
    useComposerLayout.getState().setSize(600, 4)
    useComposerLayout.getState().toggleChip('prompts')
    useComposerLayout.getState().setMenuHeight(300)

    const raw = localStorage.getItem('radium-composer-layout')
    expect(raw).toBeTruthy()
    const persisted = JSON.parse(raw!)

    expect(persisted.state.width).toBe(600)
    expect(persisted.state.rows).toBe(4)
    expect(persisted.state.chips).toEqual(['prompts'])
    expect(persisted.state.menuHeight).toBe(300)
  })
})
