import { beforeEach, describe, expect, it } from 'vitest'
import {
  chosenMediaOutputFolder,
  useMediaOutputStore,
} from '../media-output-store'

const initialState = useMediaOutputStore.getState()

describe('media output store', () => {
  beforeEach(() => {
    localStorage.clear()
    useMediaOutputStore.setState(initialState, true)
  })

  it('defaults to an empty string', () => {
    expect(useMediaOutputStore.getState().folder).toBe('')
  })

  it('updates the folder state and trims whitespace', () => {
    useMediaOutputStore.getState().setFolder('  /some/custom/path  ')
    expect(useMediaOutputStore.getState().folder).toBe('/some/custom/path')
  })

  it('resets the folder back to an empty string', () => {
    useMediaOutputStore.getState().setFolder('/another/path')
    useMediaOutputStore.getState().reset()
    expect(useMediaOutputStore.getState().folder).toBe('')
  })

  it('persists the state to localStorage under the key radium-media-output', () => {
    useMediaOutputStore.getState().setFolder('/persisted/path')

    const persistedData = localStorage.getItem('radium-media-output')
    expect(persistedData).toBeTruthy()

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsedData = JSON.parse(persistedData!)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsedData.state.folder).toBe('/persisted/path')
  })

  it('chosenMediaOutputFolder returns the correct values based on store state', async () => {
    // When empty
    let folder = await chosenMediaOutputFolder()
    expect(folder).toBeUndefined()

    // When set
    useMediaOutputStore.getState().setFolder('/chosen/path')
    folder = await chosenMediaOutputFolder()
    expect(folder).toBe('/chosen/path')
  })
})
