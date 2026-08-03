import { describe, expect, it } from 'vitest'
import exercisesJson from '../data/exercises.json'
import { APP_ID, SCHEMA_VERSION, parseBackup, summarizeBackup, type BackupFile } from './backup'
import { exportMarkdown, sessionToMarkdown } from './exportMarkdown'
import { objectParticle, withObjectParticle } from './korean'
import { isSecretSettingKey } from './secrets'
import { ROUTINE, completedSession } from './testFixtures'
import type { Exercise, Session } from '../types'

const CATALOG = new Map((exercisesJson as Exercise[]).map((e) => [e.id, e]))
const md = (s: Session) => sessionToMarkdown(s, ROUTINE, CATALOG, 0)

describe('Markdown 형식 — §6 템플릿', () => {
  it('세션 헤더에 날짜·요일·Day·시간·소요분이 들어간다', () => {
    const s = completedSession({
      dayId: 'd1',
      date: '2026-08-03',
      startedAt: '2026-08-03T09:02:00.000Z',
      endedAt: '2026-08-03T10:41:00.000Z',
    })
    const lines = md(s).split('\n')
    // §6 예시: "## 2026-08-04 (월) — Day 1 Push  [18:02–19:41, 99분]"
    expect(lines[0]).toMatch(/^## 2026-08-03 \(월\) — Day 1 Push {2}\[\d{2}:\d{2}–\d{2}:\d{2}, 99분\]$/)
  })

  it('Day 이름의 em-dash를 풀어 "Day 1 Push"로 쓴다 (§6 표기)', () => {
    expect(md(completedSession({ dayId: 'd1', date: '2026-08-03' }))).toContain('Day 1 Push')
    expect(md(completedSession({ dayId: 'd1', date: '2026-08-03' }))).not.toContain('Day 1 — Push')
  })

  it('수행 순서 줄과 계획 대비 이탈 줄', () => {
    const base = completedSession({ dayId: 'd1', date: '2026-08-03' })
    // 레터럴(계획 5번)을 2번째로 앞당긴 상황을 만든다
    const s: Session = {
      ...base,
      entries: base.entries.map((e) => {
        if (e.recordKey === 'incline-chest-press@d1') return { ...e, performedOrder: 1 }
        if (e.recordKey === 'lateral-raise@d1') return { ...e, performedOrder: 2 }
        if (e.recordKey === 'pec-deck-fly@d1') return { ...e, performedOrder: 3 }
        return { ...e, performedOrder: null, firstSetAt: undefined }
      }),
    }
    const text = md(s)
    expect(text).toContain('수행 순서: 인클라인 프레스 → 레터럴 레이즈 → 펙덱 플라이')
    // "레이즈"는 받침이 없으므로 "를" (§6 예시의 "레터럴을"은 ㄹ 받침이라 을이었다)
    expect(text).toContain('레터럴 레이즈를 2번째로 앞당김')
  })

  it('종목 줄: 이름 (Day/그룹) 무게 + 반복수', () => {
    const s = completedSession({ dayId: 'd1', date: '2026-08-03', weight: 30, repsOverride: 9 })
    const text = md(s)
    // §6 예시: "### 인클라인 프레스 (D1/A) 30kg"  다음 줄  "12 / 11 / 10 / 9"
    expect(text).toContain('### 인클라인 프레스 (D1/A) 30kg')
    expect(text).toContain('9 / 9 / 9 / 9')
  })

  it('B그룹 감각 점수와 메모', () => {
    const base = completedSession({ dayId: 'd1', date: '2026-08-03' })
    const s: Session = {
      ...base,
      entries: base.entries.map((e) =>
        e.recordKey === 'lateral-raise@d1'
          ? { ...e, sensoryScore: 3 as const, sensoryNote: '측면 확실' }
          : e,
      ),
    }
    expect(md(s)).toContain('감각: 3점 — 측면 확실')
  })

  it('보상작용은 항상 출력된다 (기본값 "없음")', () => {
    const text = md(completedSession({ dayId: 'd1', date: '2026-08-03' }))
    expect(text).toContain('보상작용: 없음')
  })

  it('증량 판단은 A그룹에만 붙고 더블 프로그레션으로 산출된다', () => {
    // 전 세트 repMax 도달 + 보상작용 없음 → 증량
    const atMax = completedSession({ dayId: 'd1', date: '2026-08-03', weight: 30, fullReps: true })
    const text = md(atMax)
    expect(text).toContain('다음: 32.5kg로 증량')

    // 미달이면 유지
    const below = completedSession({ dayId: 'd1', date: '2026-08-03', weight: 30, repsOverride: 8 })
    expect(md(below)).toContain('다음: 30kg 유지')

    // B그룹(레터럴)에는 "다음:" 줄이 없다
    const lateralBlock = md(atMax).split('### 레터럴 레이즈')[1]?.split('###')[0] ?? ''
    expect(lateralBlock).not.toContain('다음:')
  })

  it('보상작용이 있으면 증량 판단이 유지로 바뀐다', () => {
    const s = completedSession({
      dayId: 'd1',
      date: '2026-08-03',
      weight: 30,
      fullReps: true,
      compensation: '엉덩이가 시트에서 뜸',
    })
    expect(md(s)).toContain('다음: 30kg 유지')
    expect(md(s)).not.toContain('증량')
  })

  it('디로드·복귀 세션은 헤더에 표시된다 (세트 감소를 수행 저하로 오독하지 않게)', () => {
    const deload = completedSession({ dayId: 'd1', date: '2026-08-03', mode: 'deload' })
    expect(md(deload).split('\n')[0]).toContain('[디로드]')
    const ret = completedSession({ dayId: 'd1', date: '2026-08-03', mode: 'return' })
    expect(md(ret).split('\n')[0]).toContain('[복귀]')
    // normal 세션에는 모드 태그가 없다 (시간 대괄호는 항상 있으므로 태그만 확인)
    const normal = completedSession({ dayId: 'd1', date: '2026-08-03' })
    expect(md(normal).split('\n')[0]).not.toContain('[디로드]')
    expect(md(normal).split('\n')[0]).not.toContain('[복귀]')
  })

  it('미수행 종목을 별도 줄로 남긴다 ("안 함"과 "루틴에 없음"의 구분)', () => {
    const s = completedSession({
      dayId: 'd1',
      date: '2026-08-03',
      onlyExercises: ['incline-chest-press'],
    })
    // onlyExercises는 entries 자체를 줄이므로, 미수행 케이스를 직접 만든다
    const base = completedSession({ dayId: 'd1', date: '2026-08-03' })
    const partial: Session = {
      ...base,
      entries: base.entries.map((e) =>
        e.recordKey === 'pushdown@d1'
          ? { ...e, performedOrder: null, firstSetAt: undefined, sets: e.sets.map((x) => ({ ...x, done: false })) }
          : e,
      ),
    }
    expect(md(partial)).toContain('미수행: 푸쉬다운')
    expect(md(s)).not.toContain('미수행:')
  })

  it('유산소와 메모', () => {
    const base = completedSession({ dayId: 'd3', date: '2026-08-03' })
    const s: Session = {
      ...base,
      cardio: { type: '마이마운틴', minutes: 20, note: '25/3.8' },
      sessionNote: '컨디션 좋음',
    }
    const text = md(s)
    expect(text).toContain('유산소: 마이마운틴 25/3.8 · 20분')
    expect(text).toContain('메모: 컨디션 좋음')
  })

  it('fallback 세션은 정규 Day 기록 키로 출력된다 (D1 표기)', () => {
    const s = completedSession({ dayId: 'fallback-push', date: '2026-08-03' })
    const text = md(s)
    expect(text).toContain('Push 축소')
    // recordKey가 @d1이므로 (D1/A)로 나온다 — 프리필·증량이 정규 Day와 이어지는 것과 일관
    expect(text).toContain('(D1/A)')
  })
})

describe('Markdown 문서 전체', () => {
  it('제목에 기간이 들어가고 세션은 시간순(오래된 것부터)이다', () => {
    const sessions = [
      completedSession({ dayId: 'd1', date: '2026-08-03' }),
      completedSession({ dayId: 'd2', date: '2026-08-05' }),
    ]
    const text = exportMarkdown({
      sessions,
      routine: ROUTINE,
      catalog: CATALOG,
      phase: 0,
      range: { from: '2026-08-01', to: '2026-08-09' },
    })
    expect(text.split('\n')[0]).toBe('# 운동 기록 2026-08-01 ~ 2026-08-09')
    expect(text.indexOf('2026-08-03')).toBeLessThan(text.indexOf('2026-08-05'))
  })

  it('기간 밖 세션은 제외한다', () => {
    const sessions = [
      completedSession({ dayId: 'd1', date: '2026-07-31' }),
      completedSession({ dayId: 'd2', date: '2026-08-05' }),
    ]
    const text = exportMarkdown({
      sessions,
      routine: ROUTINE,
      catalog: CATALOG,
      phase: 0,
      range: { from: '2026-08-01', to: '2026-08-09' },
    })
    expect(text).not.toContain('2026-07-31')
    expect(text).toContain('2026-08-05')
  })

  it('진행 중 세션은 내보내지 않는다', () => {
    const open = completedSession({ dayId: 'd1', date: '2026-08-03' })
    delete (open as { endedAt?: string }).endedAt
    const text = exportMarkdown({
      sessions: [open],
      routine: ROUTINE,
      catalog: CATALOG,
      phase: 0,
      range: { from: '2026-08-01', to: '2026-08-09' },
    })
    expect(text).toContain('기간 내 기록 없음')
  })

  it('빈 줄이 3개 이상 연속되지 않는다', () => {
    const text = exportMarkdown({
      sessions: [completedSession({ dayId: 'd1', date: '2026-08-03' })],
      routine: ROUTINE,
      catalog: CATALOG,
      phase: 0,
      range: { from: '2026-08-01', to: '2026-08-09' },
    })
    expect(text).not.toMatch(/\n{3,}/)
  })
})

describe('JSON 백업 — 비밀값이 새지 않는다', () => {
  it('gistToken은 비밀 키로 분류된다', () => {
    expect(isSecretSettingKey('gistToken')).toBe(true)
    expect(isSecretSettingKey('currentPhase')).toBe(false)
    expect(isSecretSettingKey('gistId')).toBe(false)
  })

  it('parseBackup이 앱/스키마/배열 형태를 검사한다', () => {
    expect(parseBackup('{ not json')).toHaveProperty('problems')

    const wrongApp = parseBackup(JSON.stringify({ app: 'other', schemaVersion: 1 }))
    expect('problems' in wrongApp && wrongApp.problems.some((p) => p.includes('이 앱의 백업이 아닙니다'))).toBe(true)

    const future = parseBackup(
      JSON.stringify({ app: APP_ID, schemaVersion: 99, routines: [], exercises: [], sessions: [], settings: [] }),
    )
    expect('problems' in future && future.problems.some((p) => p.includes('앱을 업데이트'))).toBe(true)

    const notArray = parseBackup(
      JSON.stringify({ app: APP_ID, schemaVersion: 1, routines: {}, exercises: [], sessions: [], settings: [] }),
    )
    expect('problems' in notArray && notArray.problems.some((p) => p.includes('routines'))).toBe(true)
  })

  it('세션 형태가 깨진 백업은 거부한다', () => {
    const bad = parseBackup(
      JSON.stringify({
        app: APP_ID,
        schemaVersion: 1,
        routines: [],
        exercises: [],
        sessions: [{ id: 1, date: null }],
        settings: [],
      }),
    )
    expect('problems' in bad).toBe(true)
  })

  it('정상 백업은 통과하고 요약을 낸다', () => {
    const file: BackupFile = {
      app: APP_ID,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-08-05T10:00:00.000Z',
      routines: [ROUTINE],
      exercises: exercisesJson as Exercise[],
      sessions: [
        completedSession({ dayId: 'd1', date: '2026-08-03' }),
        completedSession({ dayId: 'd2', date: '2026-08-05' }),
      ],
      settings: [{ key: 'currentPhase', value: 0 }],
      exerciseNotes: [{ recordKey: 'lat-pulldown@d2', note: '시트 3칸' }],
    }
    const parsed = parseBackup(JSON.stringify(file))
    expect('file' in parsed).toBe(true)
    expect(summarizeBackup(file)).toMatchObject({
      routines: 1,
      sessions: 2,
      oldestSession: '2026-08-03',
      newestSession: '2026-08-05',
    })
  })
})

describe('한국어 조사와 순서 이탈 축약', () => {
  it('받침 유무에 따라 을/를을 고른다', () => {
    expect(objectParticle('레터럴')).toBe('을') // ㄹ 받침
    expect(objectParticle('레터럴 레이즈')).toBe('를') // 즈 — 받침 없음
    expect(objectParticle('펙덱 플라이')).toBe('를')
    expect(objectParticle('푸쉬다운')).toBe('을') // ㄴ 받침
    expect(objectParticle('컬')).toBe('을')
    expect(withObjectParticle('시티드 로우')).toBe('시티드 로우를')
  })

  it('한글이 아니면 "를"로 둔다', () => {
    expect(objectParticle('bench press')).toBe('를')
    expect(objectParticle('')).toBe('를')
  })

  it('앞당김에 밀려난 +1 이동은 보고하지 않는다', () => {
    // 계획 1,2,3,4,5 중 5번(레터럴)을 2번째로 → 2·3·4번은 각각 +1 밀린다.
    // 그 +1은 사용자의 결정이 아니라 결과다.
    const base = completedSession({ dayId: 'd1', date: '2026-08-03' })
    const perf: Record<number, number | null> = { 1: 1, 5: 2, 2: 3, 3: 4, 4: 5, 6: 6, 7: null }
    const s: Session = {
      ...base,
      entries: base.entries.map((e) => ({
        ...e,
        performedOrder: perf[e.plannedOrder] ?? null,
      })),
    }
    const line = md(s).split('\n').find((l) => l.startsWith('(계획 대비'))!
    expect(line).toBe('(계획 대비: 레터럴 레이즈를 2번째로 앞당김)')
  })

  it('순서가 계획과 같으면 이탈 줄이 없다', () => {
    const s = completedSession({ dayId: 'd2', date: '2026-08-03' })
    expect(md(s)).not.toContain('계획 대비')
  })
})

describe('T4 머신 세팅 메모 백업', () => {
  const base = {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: '2026-08-05T10:00:00.000Z',
    routines: [ROUTINE],
    exercises: exercisesJson as Exercise[],
    sessions: [],
    settings: [],
  }

  it('exerciseNotes가 없는 v1 백업도 받아들인다', () => {
    // 구버전에서 내보낸 파일이 v1.1 앱에서 열려야 한다
    const v1 = { ...base, schemaVersion: 1 }
    expect('file' in parseBackup(JSON.stringify(v1))).toBe(true)
  })

  it('exerciseNotes가 배열이 아니면 거부한다', () => {
    const bad = { ...base, exerciseNotes: { a: 1 } }
    const r = parseBackup(JSON.stringify(bad))
    expect('problems' in r && r.problems.some((p) => p.includes('exerciseNotes'))).toBe(true)
  })

  it('구버전 앱은 v2 파일을 거부한다 (스키마 버전 상향)', () => {
    // 앱 v1(SCHEMA_VERSION=1)에서 v2 파일을 열면 "앱을 업데이트하세요"가 나와야 한다.
    // 여기서는 반대 방향(앱보다 새 파일)을 같은 로직으로 확인한다
    const future = { ...base, schemaVersion: SCHEMA_VERSION + 1 }
    const r = parseBackup(JSON.stringify(future))
    expect('problems' in r && r.problems.some((p) => p.includes('앱을 업데이트'))).toBe(true)
  })

  it('스키마 버전이 3다 (식단 테이블 도입 — 파괴적 변경)', () => {
    expect(SCHEMA_VERSION).toBe(3)
  })
})
