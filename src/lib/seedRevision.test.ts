import { describe, expect, it } from 'vitest'
import routineJson from '../data/routine-v2.4.json'
import exercisesJson from '../data/exercises.json'
import { BUNDLED_ROUTINE } from '../db/seed'

/**
 * 시드 JSON을 고쳤으면 `seedRevision`을 올려라 — 기계적 강제 (R2).
 *
 * 관례로 두면 뚫린다. 실제로 뚫렸다: `recordDayId`를 마일스톤 2에서 fallbackDays에
 * 추가하면서 루틴 `version`을 그대로 뒀고, `ensureSeed`가 version만 비교했기 때문에
 * 마일스톤 1 설치본이 낡은 루틴을 **영구히** 들고 있었다. 그 결과가 두 가지였다:
 *   - fallback 세션이 정규 Day 라인(@d1)이 아니라 @fallback-push에 쌓인다
 *   - 자기가 만든 백업을 자기가 복원하지 못한다 (validateRoutine 거부)
 *
 * 그래서 시드의 **내용 해시**와 `seedRevision`을 쌍으로 고정한다.
 * 둘 중 하나만 바뀌면 실패하므로, JSON을 고친 사람은 revision을 올리고 이 스냅샷도
 * 함께 갱신해야 한다.
 */

/**
 * 키 순서에 무관한 결정적 해시.
 *
 * `JSON.stringify`를 그대로 쓰면 키 순서만 바뀌어도 해시가 달라져서 의미 없는 실패가
 * 난다. 암호학적 강도는 필요 없다 (충돌 공격 대상이 아니라 실수 감지용) — FNV-1a로 충분하다.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * ⚠ **시드 JSON을 고쳤다면**: `routine-v2.4.json`의 `seedRevision`을 올리고,
 * 아래 스냅샷의 `seedRevision`과 `hash`를 테스트 실패 메시지에 찍힌 값으로 갱신하라.
 * 해시만 갱신하고 revision을 올리지 않으면 기존 설치본에 변경이 전달되지 않는다.
 */
const SNAPSHOT = {
  seedRevision: 1,
  routineHash: 'af6d7b05',
  exerciseCount: 28,
}

describe('시드 리비전 강제', () => {
  it('시드 JSON 내용과 seedRevision이 쌍으로 고정돼 있다', () => {
    expect({
      seedRevision: (routineJson as { seedRevision: number }).seedRevision,
      routineHash: fnv1a(stableStringify(routineJson)),
      exerciseCount: (exercisesJson as unknown[]).length,
    }).toEqual(SNAPSHOT)
  })

  it('타입과 실제 JSON의 seedRevision이 일치한다', () => {
    expect(BUNDLED_ROUTINE.seedRevision).toBe(SNAPSHOT.seedRevision)
    expect(Number.isInteger(BUNDLED_ROUTINE.seedRevision)).toBe(true)
    expect(BUNDLED_ROUTINE.seedRevision).toBeGreaterThan(0)
  })

  it('해시는 키 순서에 무관하다 (의미 없는 실패를 만들지 않는다)', () => {
    const a = { x: 1, y: [1, { p: 'a', q: 'b' }] }
    const b = { y: [1, { q: 'b', p: 'a' }], x: 1 }
    expect(fnv1a(stableStringify(a))).toBe(fnv1a(stableStringify(b)))
  })

  it('내용이 바뀌면 해시가 바뀐다', () => {
    const changed = { ...routineJson, version: '9.9' }
    expect(fnv1a(stableStringify(changed))).not.toBe(SNAPSHOT.routineHash)
  })
})
