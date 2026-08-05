import { create } from 'zustand'
import { getSetting, setSetting } from '../db'
import { DEFAULT_SOUND_VOLUME, setVolumeScale, volumeScaleFor, type SoundVolume } from '../lib/beep'
import { DEFAULT_A_ECCENTRIC, type AEccentricSec } from '../lib/tempo'
import type { Phase } from '../types'

interface SettingsState {
  loaded: boolean
  currentPhase: Phase
  onboardingDone: boolean
  /**
   * 체중 (T8). 어시스티드 풀업의 보조 무게를 역산하는 데만 쓴다.
   * 체중 **추이**는 저장하지 않는다 — 체성분 기록은 설계상 비목적(§1)이고
   * 인바디 앱과 중복이다. 여기 있는 것은 계산에 필요한 현재 값 하나다.
   */
  bodyWeightKg?: number
  /** 템포 가이드 사용 (G7) */
  tempoGuide: boolean
  /** 신호 볼륨 (Z1). 배율은 `beep.ts`가 소유하고 이 값은 그 선택지다 */
  soundVolume: SoundVolume
  /**
   * A그룹 이완 초 (CC16). 문서 3장이 "1.5~2초 (기본 2)" 범위로 규정한다 —
   * 범위 밖 값은 설정에 없다. B그룹·코어는 열지 않는다 (감각 점수 체계의 전제).
   */
  aEccentricSec: AEccentricSec

  load: () => Promise<void>
  setPhase: (phase: Phase) => Promise<void>
  setOnboardingDone: (done: boolean) => Promise<void>
  setBodyWeight: (kg: number) => Promise<void>
  setTempoGuide: (on: boolean) => Promise<void>
  setSoundVolume: (volume: SoundVolume) => Promise<void>
  setAEccentricSec: (sec: AEccentricSec) => Promise<void>
}

/**
 * 설정만 zustand로 들고 있는다. 루틴·세션은 Dexie live query로 직접 읽는다
 * (단일 진실 원천은 IndexedDB — §3 "파생 계산" 원칙과 같은 이유).
 */
export const useSettings = create<SettingsState>((set) => ({
  loaded: false,
  currentPhase: 0,
  onboardingDone: false,
  tempoGuide: false,
  soundVolume: DEFAULT_SOUND_VOLUME,
  aEccentricSec: DEFAULT_A_ECCENTRIC,

  load: async () => {
    // activeRoutineId는 여기 두지 않는다 — 루틴 교체 시 낡은 값이 남고,
    // 실제 소비처인 getActiveRoutine()이 Dexie에서 직접 읽는다
    const [currentPhase, onboardingDone, bodyWeightKg, tempoGuide, soundVolume, aEccentricSec] =
      await Promise.all([
        getSetting<Phase>('currentPhase', 0),
        getSetting<boolean>('onboardingDone', false),
        getSetting<number | undefined>('bodyWeightKg', undefined),
        getSetting<boolean>('tempoGuide', false),
        getSetting<SoundVolume>('soundVolume', DEFAULT_SOUND_VOLUME),
        getSetting<AEccentricSec>('aEccentricSec', DEFAULT_A_ECCENTRIC),
      ])
    /*
     * 부팅 시 배율을 오디오 모듈에 밀어 넣는다 (Z1).
     * 저장값이 이상해도 `volumeScaleFor`가 기본값으로 떨어뜨린다 — 소리가 사라지는
     * 방향으로 실패하지 않는다.
     */
    setVolumeScale(volumeScaleFor(soundVolume))
    set({
      loaded: true,
      currentPhase,
      onboardingDone,
      bodyWeightKg,
      tempoGuide,
      soundVolume,
      aEccentricSec,
    })
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

  setBodyWeight: async (kg) => {
    await setSetting('bodyWeightKg', kg)
    set({ bodyWeightKg: kg })
  },

  setTempoGuide: async (on) => {
    await setSetting('tempoGuide', on)
    set({ tempoGuide: on })
  },

  setSoundVolume: async (volume) => {
    // 저장보다 먼저 배율을 적용한다 — 바로 이어지는 "미리 듣기"가 새 값으로 들려야 한다
    setVolumeScale(volumeScaleFor(volume))
    await setSetting('soundVolume', volume)
    set({ soundVolume: volume })
  },

  setAEccentricSec: async (sec) => {
    await setSetting('aEccentricSec', sec)
    set({ aEccentricSec: sec })
  },
}))
