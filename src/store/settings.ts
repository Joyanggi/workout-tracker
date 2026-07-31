import { create } from 'zustand'
import { getSetting, setSetting } from '../db'
import type { Phase } from '../types'

interface SettingsState {
  loaded: boolean
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
  currentPhase: 0,
  onboardingDone: false,

  load: async () => {
    // activeRoutineId는 여기 두지 않는다 — 루틴 교체 시 낡은 값이 남고,
    // 실제 소비처인 getActiveRoutine()이 Dexie에서 직접 읽는다
    const [currentPhase, onboardingDone] = await Promise.all([
      getSetting<Phase>('currentPhase', 0),
      getSetting<boolean>('onboardingDone', false),
    ])
    set({ loaded: true, currentPhase, onboardingDone })
  },

  setPhase: async (phase) => {
    // 전환 이력을 남긴다 (T3). 통계·내보내기에서 "언제 Phase가 올랐나"를 알 수 있어야
    // 추이 해석이 된다 — Phase가 바뀌면 목표 반복수·볼륨 기준이 함께 바뀌기 때문이다.
    const history = await getSetting<Record<string, string>>('phaseChangedAt', {})
    await setSetting('phaseChangedAt', { ...history, [phase]: new Date().toISOString() })
    await setSetting('currentPhase', phase)
    set({ currentPhase: phase })
  },

  setOnboardingDone: async (done) => {
    await setSetting('onboardingDone', done)
    set({ onboardingDone: done })
  },
}))
