import { isIOS, isStandalone } from '../lib/platform'
import { useSettings } from '../store/settings'

/**
 * §2 요구사항: 첫 실행에 "홈 화면에 추가" 안내 필수.
 * Safari 탭으로만 쓰면 7일 미사용 시 ITP로 IndexedDB가 지워질 수 있다 (§11).
 */
export default function Onboarding() {
  const setOnboardingDone = useSettings((s) => s.setOnboardingDone)
  const standalone = isStandalone()
  const ios = isIOS()

  return (
    <div className="onboarding">
      <h1>운동 기록</h1>
      <p className="lede">
        피지크형 상체 루틴 v2.4 전용. 세트별 반복수 · 감각 점수 · 보상작용 · 수행 순서를
        헬스장에서 바로 입력합니다.
      </p>

      {standalone ? (
        <div className="card" style={{ borderColor: 'rgba(52,199,89,.35)' }}>
          <div className="card-label" style={{ color: 'var(--ok)' }}>
            준비 완료
          </div>
          홈 화면 앱으로 실행 중입니다. 기록이 안전하게 보관됩니다.
        </div>
      ) : (
        <>
          <div className="card-label">1단계 — 홈 화면에 추가</div>
          <ol className="steps">
            <li>
              Safari 하단의 <strong>공유 버튼</strong>(□↑)을 누릅니다.
            </li>
            <li>
              메뉴에서 <strong>“홈 화면에 추가”</strong>를 선택합니다.
            </li>
            <li>
              <strong>추가</strong>를 누르고, 홈 화면의 <strong>운동기록</strong> 아이콘으로
              다시 엽니다.
            </li>
          </ol>

          <div className="warn-box">
            <strong>Safari 탭으로 쓰면 기록이 사라질 수 있습니다.</strong>
            <br />
            iOS는 7일간 열지 않은 사이트의 저장 데이터를 자동 삭제합니다. 홈 화면 앱은 이
            삭제 대상에서 제외됩니다.
          </div>

          {!ios && (
            <p className="row-sub" style={{ marginBottom: 20 }}>
              iOS가 아닌 환경입니다. 브라우저 메뉴의 “앱 설치”를 사용하세요.
            </p>
          )}

          <div className="card">
            <div className="card-label">주소</div>
            <div className="mono">{window.location.href}</div>
          </div>
        </>
      )}

      <div className="spacer" />

      <button className="btn btn-primary" onClick={() => void setOnboardingDone(true)}>
        {standalone ? '시작하기' : '확인했어요, 그래도 계속'}
      </button>
      {!standalone && (
        <p className="row-sub" style={{ textAlign: 'center', marginTop: 12 }}>
          홈 화면에 추가하기 전까지 상단에 경고가 계속 표시됩니다.
        </p>
      )}
    </div>
  )
}
