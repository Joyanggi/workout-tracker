import { describe, expect, it } from 'vitest'
import { BANNER_ORDER, bannerQueue, type BannerConditions } from './bannerQueue'
import { BANNER_BACKUP, BANNER_COMPENSATION, BANNER_DELOAD, BANNER_PHASE } from '../store/ui'
import { stripComments } from './sourceScan'

/**
 * 배너 큐 (BB4).
 *
 * 이 테스트의 목적은 두 가지다: ① 우선순위·배제가 **현행 그대로** 옮겨졌는지
 * (이 라운드는 마감이므로 동작이 바뀌면 실패다), ② 동시에 뜨는 개수가 계산되는지.
 */
const NONE: BannerConditions = {
  hasReturn: false,
  deloadDue: false,
  backupStale: false,
  phaseReady: false,
  hasWatches: false,
  hasProgressions: false,
}

const q = (c: Partial<BannerConditions>, dismissed: Record<string, boolean> = {}) =>
  bannerQueue({ ...NONE, ...c }, dismissed)

describe('우선순위', () => {
  it('아무 조건도 없으면 빈 큐다', () => {
    expect(q({})).toEqual([])
  })

  it('선언된 순서대로 나온다', () => {
    // 배제가 없는 조합으로 순서만 확인한다 (백업은 아무것도 가리지 않는다)
    expect(q({ backupStale: true, hasProgressions: true })).toEqual(['backup', 'progression'])
  })

  it('BANNER_ORDER가 계획서의 우선순위와 같다', () => {
    expect(BANNER_ORDER).toEqual([
      'return',
      'deload',
      'backup',
      'phase',
      'compensation',
      'progression',
    ])
  })
})

describe('상호 배제 — 현행 규칙 그대로', () => {
  it('복귀는 디로드·Phase·보상작용·증량을 전부 가린다', () => {
    // 복귀는 이미 볼륨을 줄인 상태 — 디로드 권고가 중복이고 증량은 모순이다
    const all: BannerConditions = {
      hasReturn: true,
      deloadDue: true,
      backupStale: true,
      phaseReady: true,
      hasWatches: true,
      hasProgressions: true,
    }
    expect(bannerQueue(all, {})).toEqual(['return', 'backup'])
  })

  it('디로드는 Phase·보상작용·증량을 가린다', () => {
    expect(
      q({ deloadDue: true, phaseReady: true, hasWatches: true, hasProgressions: true }),
    ).toEqual(['deload'])
  })

  it('Phase는 증량만 가리고 보상작용은 함께 뜬다', () => {
    // 현행 코드가 그렇다: watches는 return/deload만 배제하고 phase는 보지 않는다
    expect(q({ phaseReady: true, hasWatches: true, hasProgressions: true })).toEqual([
      'phase',
      'compensation',
    ])
  })

  it('보상작용과 증량은 함께 뜬다 — 둘 다 종목별 목록이고 대상이 다르다', () => {
    expect(q({ hasWatches: true, hasProgressions: true })).toEqual([
      'compensation',
      'progression',
    ])
  })

  it('백업은 아무것도 가리지 않고 아무것에도 가려지지 않는다', () => {
    expect(q({ backupStale: true, hasReturn: true })).toContain('backup')
    expect(q({ backupStale: true, deloadDue: true })).toEqual(['deload', 'backup'])
  })
})

describe('dismiss', () => {
  it('닫은 배너는 큐에서 빠진다', () => {
    expect(q({ deloadDue: true }, { [BANNER_DELOAD]: true })).toEqual([])
    expect(q({ backupStale: true }, { [BANNER_BACKUP]: true })).toEqual([])
    expect(q({ phaseReady: true }, { [BANNER_PHASE]: true })).toEqual([])
    expect(q({ hasWatches: true }, { [BANNER_COMPENSATION]: true })).toEqual([])
  })

  it('닫은 배너는 아무것도 가리지 않는다 — 닫았는데 아무것도 안 보이면 안 된다', () => {
    // 현행 semantics: showDeload에 !dismissed가 들어 있고 showPhase가 그 값을 본다
    expect(q({ deloadDue: true, phaseReady: true }, { [BANNER_DELOAD]: true })).toEqual(['phase'])
  })

  it('복귀는 dismiss 대상이 아니다 — 모드 판정이지 알림이 아니다', () => {
    const dismissAll = {
      [BANNER_DELOAD]: true,
      [BANNER_BACKUP]: true,
      [BANNER_PHASE]: true,
      [BANNER_COMPENSATION]: true,
    }
    expect(q({ hasReturn: true }, dismissAll)).toEqual(['return'])
  })
})

describe('접기 판단의 근거 — 실제로 쌓이는 조합', () => {
  it('백업 + 증량 + 보상작용이 동시에 3개다 (BB4가 지목한 상황)', () => {
    const stacked = q({ backupStale: true, hasWatches: true, hasProgressions: true })
    expect(stacked).toHaveLength(3)
    // 첫 번째만 펼치고 2개가 접힌다
    expect(stacked[0]).toBe('backup')
    expect(stacked.length - 1).toBe(2)
  })
})

describe('화면 배선 (2층 잠금)', () => {
  const home = () => {
    const sources = import.meta.glob('/src/screens/*.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    const src = sources['/src/screens/HomeScreen.tsx']
    expect(src, 'HomeScreen을 찾지 못했다 — 이 검사가 헛돌고 있다').toBeDefined()
    return stripComments(src!)
  }

  it('큐에서 렌더한다', () => {
    expect(home()).toMatch(/queue\.slice\(0, bannersOpen \? queue\.length : 1\)/)
  })

  it('배너 표시 조건을 화면이 다시 계산하지 않는다', () => {
    /*
      예전의 `!showReturn && !showDeload && …` 사슬이 되살아나면 큐와 화면이 서로 다른
      답을 낼 수 있다. 조건은 bannerQueue에만 있어야 한다.
    */
    const src = home()
    for (const gone of ['showReturn', 'showDeload', 'showPhase']) {
      expect(src, `${gone}가 남아 있다`).not.toContain(gone)
    }
    /*
      `dismissed[BANNER_…]`를 화면이 직접 보는 자리는 **정확히 하나**여야 한다:
      큐 밖의 백업 미설정 배너 (후속 2). 큐에 있는 배너가 여기서 다시 dismiss를 보면
      큐와 화면이 서로 다른 답을 낼 수 있다.
    */
    const direct = src.match(/dismissed\[BANNER_[A-Z_]+\]/g) ?? []
    expect(direct).toEqual(['dismissed[BANNER_BACKUP]'])
  })

  it('저장소 위험 배너는 큐 밖에 있다 — 접히면 안 된다', () => {
    const src = home()
    expect(src).toMatch(/storageAtRisk\(\) && \(/)
    // storageAtRisk가 큐 조건에 들어가지 않았는지
    expect(src).not.toMatch(/storageAtRisk[^\n]*bannerQueue|bannerQueue[^)]*storageAtRisk/)
  })
})

/**
 * 백업 배너를 `configured`로 가른다 (v1.7 후속 2).
 *
 * 미설정은 **백업이 아예 없는 상태**라 데이터 유실 축이고 접히면 안 된다.
 * 설정됨+오래됨은 세션 종료마다 자동 백업이 도는 상태의 보조 신호이므로 큐에 남긴다.
 */
describe('백업 미설정은 큐 밖 (후속 2)', () => {
  const home = () => {
    const sources = import.meta.glob('/src/screens/*.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    return stripComments(sources['/src/screens/HomeScreen.tsx']!)
  }

  it('큐에는 "설정됨 + 오래됨"만 넣는다', () => {
    expect(home()).toMatch(/backupStale: reminder\.show && reminder\.configured/)
  })

  it('미설정 배너는 큐 밖에서 렌더한다', () => {
    const src = home()
    expect(src).toMatch(/reminder\.show && !reminder\.configured/)
    // 큐 렌더보다 위에 있어야 한다 (다른 배너에 밀리지 않는다)
    expect(src.indexOf('!reminder.configured')).toBeLessThan(src.indexOf('queue.slice('))
  })

  it('큐의 백업 배너 문구가 한 가지만 말한다', () => {
    // 두 상태를 삼항으로 겸하던 문구를 갈랐다 — 각 배너가 자기 상태만 말한다
    const src = home()
    expect(src).toMatch(/마지막 백업이 \{reminder\.daysSince/)
    expect(src).not.toMatch(/reminder\.configured\s*\n?\s*\?/)
  })

  it('미설정 상태는 큐에 들어가지 않는다 (조건 함수 수준)', () => {
    // configured=false인 상황을 큐에 넣으면 접힐 수 있다 — backupStale이 false여야 한다
    expect(q({ backupStale: false, hasProgressions: true })).toEqual(['progression'])
  })
})
