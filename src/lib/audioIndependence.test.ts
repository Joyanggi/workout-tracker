import { describe, expect, it } from 'vitest'
import { stripComments } from './sourceScan'

/**
 * 소리 경로가 **템포 가이드 설정과 무관**함을 강제한다 (W2 ①).
 *
 * 실사용 보고: "3·2·1 틱이 안 울리는데, 템포 가이드 설정을 켜면 틱도 나는 것 같다."
 * 가장 그럴듯한 가설은 두 기능이 플래그를 잘못 공유한다는 것이었다. 조사 결과 **아니었다** —
 * 소리 경로에 설정을 읽는 코드가 아예 없고, 스케줄링도 정상이었다
 * (`useRestTimer.test.ts` W2 재현: 모든 restSec에서 3·2·1 발화).
 * 진짜 원인은 음향이었다 (`beep.ts` 신호 규격 주석 — 폰 스피커에서 31dB 손실).
 *
 * 가설이 틀렸어도 **그 무관함 자체는 지킬 값이 있다.** 누가 "가이드가 켜져 있을 때만
 * 톤을 낸다" 같은 조건을 소리 경로에 넣으면 이 증상이 진짜로 생긴다.
 * 운동 쪽 `substituteCoverage`·식단 쪽 `dietAccess`와 같은 방식(소스 스캔)이다.
 */

const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const appFiles = Object.entries(sources).filter(([path]) => !path.endsWith('.test.ts'))

/**
 * **소리를 내는** 파일 = beep에서 `tick`·`chime`·`tone`을 import하는 파일.
 *
 * "`tick()` 호출"로 찾으면 안 된다 — `SessionScreen`에 경과 시간을 갱신하는 지역 함수
 * `tick`이 있어서 잡힌다(가려진 이름). import 목록으로 판정해야 정확하다.
 * `unlockAudio`만 쓰는 파일은 제스처 배선이라 여기 들지 않는다 (아래에서 따로 본다).
 */
const emitters = appFiles.filter(([, src]) =>
  /import \{([^}]*)\} from '\.{1,2}\/(lib\/)?beep'/.exec(src)?.[1]?.match(/\b(tick|chime|tone)\b/),
)

describe('소리 경로의 설정 독립성 (W2)', () => {
  it('스캔이 실제로 소리 파일을 찾는다 (정규식이 깨지면 항상 통과한다)', () => {
    /*
     * 목록을 열어 두지 않고 못 박는 이유: 소리를 내는 곳이 늘어나면 그 파일도
     * 아래 "설정을 읽지 않는다" 검사를 받아야 한다. 새 파일이 조용히 추가되면
     * 검사 대상에서 빠진 채로 통과한다.
     *   useRestTimer — 틱·차임
     *   TempoGuideSheet — 카운트인·페이즈 톤·마지막 큐
     * (v1.3의 소리 진단 패널은 역할을 마치고 X10에서 삭제했다 — git 이력에 있다)
     */
    expect(emitters.map(([p]) => p).sort()).toEqual([
      '/src/components/TempoGuideSheet.tsx',
      '/src/lib/useRestTimer.ts',
    ])
  })

  it('소리를 내는 파일은 tempoGuide 설정을 읽지 않는다', () => {
    const offenders = emitters.filter(([, src]) => /\btempoGuide\b/.test(src)).map(([path]) => path)

    expect(
      offenders,
      `소리를 내는 코드가 템포 가이드 설정을 읽으면 "가이드를 켜야 틱이 난다"가 실제로 생깁니다.\n` +
        `설정은 ♩ 버튼 노출만 결정해야 합니다 (ExerciseCard):\n` +
        offenders.map((f) => `  ${f}`).join('\n'),
    ).toEqual([])
  })

  it('휴식 타이머는 설정 스토어를 아예 import하지 않는다', () => {
    const src = sources['/src/lib/useRestTimer.ts']
    expect(src).toBeDefined()
    expect(src).not.toMatch(/useSettings|store\/settings/)
  })

  /*
   * 컨텍스트를 여는 제스처가 조건에 걸리면 틱·차임이 **둘 다** 죽는다.
   * iOS는 제스처 밖에서 AudioContext를 못 만들고, 세트 체크가 유일한 기회다.
   * 여기에 `if (tempoGuide)`가 들어가면 보고된 증상이 진짜로 재현된다.
   */
  it('세트 체크의 unlockAudio는 조건 없이 실행된다', () => {
    const src = sources['/src/screens/SessionScreen.tsx']
    expect(src).toBeDefined()
    const handler = /onSetChecked=\{\(ex\) => \{([\s\S]*?)\n {14}\}\}/.exec(src!)?.[1]
    expect(handler, 'onSetChecked 핸들러를 찾지 못했다 — 이 검사가 헛돌고 있다').toBeDefined()
    // 주석을 걷어낸 **첫 문장**이어야 한다 — 조건 뒤로 밀리면 여기서 걸린다
    const statements = handler!
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('//'))
    expect(statements[0]).toBe('unlockAudio()')
    expect(handler).not.toMatch(/\btempoGuide\b/)
  })
})

/**
 * 톤 규격이 한 곳에만 있어야 한다.
 *
 * v1.2는 템포 가이드 카운트인에 `tone({ freq: 330, duration: 0.08, gain: 0.16 })`을
 * **손으로 베껴** 적어 뒀다 — `beep.ts`의 `tick()`과 같은 값이라 그때는 문제가 없었지만,
 * W2에서 틱 주파수를 784Hz로 고치는 순간 **가이드 카운트인만 옛 소리로 남을** 상황이었다.
 * 같은 값을 두 곳에서 적는 것이 이 프로젝트의 반복 결함(패턴 A)이다.
 */
describe('톤 규격의 단일 정의', () => {
  /**
   * beep.ts = 신호 규격 (틱·차임·큐) · tempo.ts = 페이즈 경계음 팔레트.
   *
   * **이 목록이 한 라운드 만에 두 번 바뀌었다.** CC7이 페이즈 소리를 연속 글라이드로
   * 바꾸면서 tempo.ts의 `freq:` 리터럴이 사라져 목록에서 뺐고(없는 리터럴을 "허용"으로
   * 두면 자기검증이 실패한다), CC7-R이 경계음을 되돌리면서 다시 들어왔다.
   * 목록 자체가 아니라 **자기검증이 이 목록을 정직하게 유지한다.**
   */
  const ALLOWED = ['/src/lib/beep.ts', '/src/lib/tempo.ts']

  it('주파수 리터럴은 정의 파일에만 있다', () => {
    const offenders = appFiles
      .filter(([path]) => !ALLOWED.includes(path))
      .filter(([, src]) => /\bfreq:\s*\d/.test(src))
      .map(([path]) => path)

    expect(
      offenders,
      `톤 규격을 베껴 적으면 한쪽만 고쳐졌을 때 소리가 갈라집니다.\n` +
        `beep.ts의 tick()/chime()이나 tempo.ts의 phaseTone()을 호출하세요:\n` +
        offenders.map((f) => `  ${f}`).join('\n'),
    ).toEqual([])
  })

  it('허용 파일에는 실제로 리터럴이 있다 (검사가 헛돌지 않게)', () => {
    for (const path of ALLOWED) {
      expect(sources[path], `${path}가 없습니다`).toMatch(/\bfreq:\s*\d/)
    }
  })

  it('템포 가이드 카운트인이 휴식 타이머와 같은 함수를 쓴다', () => {
    const src = sources['/src/components/TempoGuideSheet.tsx']
    expect(src).toBeDefined()
    /*
      카운트인은 `tick()`을 호출한다 — 규격을 베끼지 않는다.
      인자는 **태그**다 (CC2): 가이드를 닫을 때 예약된 틱까지 취소하려면 'tempo'여야 한다.
    */
    expect(src).toMatch(/\btick\('tempo'\)/)
  })

  it('페이즈 경계음 규격이 phaseTone 한 곳에만 있다 (CC7-R)', () => {
    const src = sources['/src/lib/tempo.ts']!
    const fn = /export function phaseTone[\s\S]*?\n\}/.exec(src)?.[0] ?? ''
    expect(fn, 'phaseTone을 찾지 못했다 — 이 검사가 헛돌고 있다').toMatch(/freq: \d/)
    // tempo.ts의 freq 리터럴은 그 함수 안에만 있어야 한다 (다른 곳에 팔레트 사본 금지)
    const outside = stripComments(src).replace(fn, '')
    expect(outside).not.toMatch(/freq:\s*\d/)
  })
})
