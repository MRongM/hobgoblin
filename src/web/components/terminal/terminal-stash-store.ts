import { create } from 'zustand'

interface TerminalStashState {
  stashedTerminals: Record<string, string>
  stash: (key: string, sessionId: string) => void
  restore: (key: string) => void
}

export const useTerminalStashStore = create<TerminalStashState>((set) => ({
  stashedTerminals: {},
  stash: (key, sessionId) => set((state) => ({ stashedTerminals: { ...state.stashedTerminals, [key]: sessionId } })),
  restore: (key) =>
    set((state) => {
      if (!(key in state.stashedTerminals)) return state
      const stashedTerminals = { ...state.stashedTerminals }
      delete stashedTerminals[key]
      return { stashedTerminals }
    }),
}))
