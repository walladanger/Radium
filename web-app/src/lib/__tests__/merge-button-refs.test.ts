import { describe, it, expect } from 'vitest'
import { mergeButtonRefs } from '../merge-button-refs'

describe('mergeButtonRefs', () => {
  it('updates MutableRefObjects with the given element', () => {
    const ref1: React.MutableRefObject<HTMLButtonElement | null> = { current: null }
    const ref2: React.MutableRefObject<HTMLButtonElement | null> = { current: null }
    const mergedRef = mergeButtonRefs([ref1, ref2])
    const element = document.createElement('button')

    mergedRef(element)

    expect(ref1.current).toBe(element)
    expect(ref2.current).toBe(element)
  })

  it('calls callback refs with the given element', () => {
    let calledValue1: HTMLButtonElement | null | undefined = undefined
    let calledValue2: HTMLButtonElement | null | undefined = undefined
    const ref1 = (value: HTMLButtonElement | null) => { calledValue1 = value }
    const ref2 = (value: HTMLButtonElement | null) => { calledValue2 = value }

    const mergedRef = mergeButtonRefs([ref1, ref2])
    const element = document.createElement('button')

    mergedRef(element)

    expect(calledValue1).toBe(element)
    expect(calledValue2).toBe(element)
  })

  it('handles a mix of callback, mutable, and null/undefined refs without throwing', () => {
    const ref1: React.MutableRefObject<HTMLButtonElement | null> = { current: null }
    let calledValue: HTMLButtonElement | null | undefined = undefined
    const ref2 = (value: HTMLButtonElement | null) => { calledValue = value }

    // We ignore the TS error for testing the runtime behavior of null/undefined in the array
    const refsArray: any[] = [ref1, ref2, null, undefined]
    const mergedRef = mergeButtonRefs(refsArray)
    const element = document.createElement('button')

    // Should not throw
    mergedRef(element)

    expect(ref1.current).toBe(element)
    expect(calledValue).toBe(element)
  })

  it('propagates null when the component unmounts', () => {
    const ref1: React.MutableRefObject<HTMLButtonElement | null> = { current: document.createElement('button') }
    let calledValue: HTMLButtonElement | null | undefined = undefined
    const ref2 = (value: HTMLButtonElement | null) => { calledValue = value }

    const mergedRef = mergeButtonRefs([ref1, ref2])

    mergedRef(null)

    expect(ref1.current).toBeNull()
    expect(calledValue).toBeNull()
  })
})
