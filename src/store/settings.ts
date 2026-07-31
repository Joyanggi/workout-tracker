import { create } from 'zustand'
import { getSetting, setSetting } from '../db'
import type { Phase } from '../types'

interface SettingsState {
  loaded: boolean
  activeRoutineId: string | null
  currentPhase: Phase
  onboardingDone: boolean

  load: () => Promise<void>
  setPhase: (phase: Phase) => Promise<void>
  setOnboardingDone: (done: boolean) => Promise<void>
}

/**
 * 설정만 zustand로 들고 있는다. 루틴·세션은 Dexie live query로 직접 읽는다
 * (단일 진실 원천은 IndexedDB — §3 "파생 계산" 원칙과 같은 이유).
 */
export const useSettings = create<SettingsState>((set) => ({
  loaded: false,
  activeRoutineId: null,
  currentPhase: 0,
  onboardingDone: false,

  load: async () => {
    const [activeRoutineId, currentPhase, onboardingDone] = await Promise.all([
      getSetting<string | null>('activeRoutineId', null),
      getSetting<Phase>('currentPhase', 0),
      getSetting<boolean>('onboardingDone', false),
    ])
    set({ loaded: true, activeRoutineId, currentPhase, onboardingDone })
  },

  setPhase: async (phase) => {
    await setSetting('currentPhase', phase)
    set({ currentPhase: phase })
  },

  setOnboardingDone: async (done) => {
    await setSetting('onboardingDone', done)
    set({ onboardingDone: done })
  },
}))
