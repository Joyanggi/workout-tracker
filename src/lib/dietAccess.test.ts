import { describe, expect, it } from 'vitest'

/**
 * `db.dietDays` 접근 경로 화이트리스트 (H1 — 리뷰어 지시).
 *
 * 식단 기록은 읽기 경계에서 **훈련일 여부를 정규화**해야 한다
 * (`diet.resolveTrainingDays` — 저장값이 낡을 수 있고, 정규화를 건너뛰면 화면과
 * 내보내기가 다른 슬롯 수로 판정한다. 실기기 백업에서 실제로 그 상태가 나왔다).
 *
 * 그 정규화는 `useDiet` 한 곳에만 있다. 누군가 `db.dietDays`를 직접 읽으면 우회된다.
 * 운동 쪽은 `findRoutineExercise`의 export를 제거해 길을 막았지만, Dexie 테이블은
 * 그렇게 감출 수 없다 — 그래서 **소스 스캔으로 화이트리스트를 강제한다.**
 * 리뷰어 판단: "lint 설정보다 싸고 확실하다."
 */

const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * 허용되는 이유:
 * - `db/index.ts` — 테이블 선언과 저수준 헬퍼가 있는 곳
 * - `lib/backup.ts` — 백업은 **의도적으로 raw**를 덤프한다 (저장된 값 그대로 보존)
 * - `lib/useDiet.ts` — 정규화를 걸어 내보내는 단일 읽기 경로
 */
const ALLOWED = ['/src/db/index.ts', '/src/lib/backup.ts', '/src/lib/useDiet.ts']

describe('식단 테이블 접근 화이트리스트 (H1)', () => {
  it('db.dietDays를 허용된 파일에서만 참조한다', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.endsWith('.test.ts') && !ALLOWED.includes(path))
      .filter(([, src]) => /\bdb\.dietDays\b/.test(src))
      .map(([path]) => path)

    expect(
      offenders,
      `db.dietDays를 직접 읽으면 훈련일 정규화(resolveTrainingDays)를 우회합니다.\n` +
        `useDiet()을 쓰거나, 정말 raw가 필요하면 ALLOWED에 근거와 함께 추가하세요:\n` +
        offenders.map((f) => `  ${f}`).join('\n'),
    ).toEqual([])
  })

  it('허용 목록의 파일들이 실제로 존재한다 (경로 오타로 검사가 헛돌지 않게)', () => {
    for (const path of ALLOWED) {
      expect(sources[path], `${path}가 없습니다`).toBeDefined()
    }
  })

  it('스캔이 실제로 참조를 찾는다 (정규식이 깨지면 항상 통과한다)', () => {
    const found = Object.entries(sources).filter(([, src]) => /\bdb\.dietDays\b/.test(src))
    expect(found.length).toBeGreaterThan(0)
  })

  it('정규화 함수는 useDiet에서만 호출한다', () => {
    // 여러 곳에서 부르면 "어디는 정규화된 값, 어디는 아닌 값"이 다시 생긴다
    const callers = Object.entries(sources)
      .filter(([path]) => !path.endsWith('.test.ts') && path !== '/src/lib/diet.ts')
      .filter(([, src]) => /resolveTrainingDays\s*\(/.test(src))
      .map(([path]) => path)
    expect(callers).toEqual(['/src/lib/useDiet.ts'])
  })
})
