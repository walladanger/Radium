/** Prompts the user can drop into the composer from the Prompts chip. */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SavedPrompt = { id: string; title: string; text: string }

const STARTERS: SavedPrompt[] = [
  { id: 'starter-summarize', title: 'Summarize', text: 'Summarize the following in a few clear bullet points:\n\n' },
  { id: 'starter-explain', title: 'Explain simply', text: 'Explain the following as if I am new to the topic:\n\n' },
  { id: 'starter-improve', title: 'Improve writing', text: 'Improve the clarity and tone of this text without changing its meaning:\n\n' },
  { id: 'starter-brainstorm', title: 'Brainstorm', text: 'Give me ten different ideas for:\n\n' },
]

type SavedPromptsState = {
  prompts: SavedPrompt[]
  add: (title: string, text: string) => void
  remove: (id: string) => void
}

export const useSavedPrompts = create<SavedPromptsState>()(
  persist(
    (set) => ({
      prompts: STARTERS,
      add: (title, text) =>
        set((state) => ({
          prompts: [
            ...state.prompts,
            { id: `prompt-${Date.now()}`, title: title.trim() || text.slice(0, 24), text },
          ],
        })),
      remove: (id) =>
        set((state) => ({ prompts: state.prompts.filter((p) => p.id !== id) })),
    }),
    { name: 'radium-saved-prompts' }
  )
)
