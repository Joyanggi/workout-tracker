export default function PlaceholderScreen({
  title,
  milestone,
  items,
}: {
  title: string
  milestone: string
  items: string[]
}) {
  return (
    <div className="screen">
      <h1 className="screen-title">{title}</h1>
      <p className="screen-sub">{milestone}에서 구현합니다.</p>
      <div className="card">
        <div className="card-label">예정 기능</div>
        {items.map((item) => (
          <div className="row" key={item}>
            <div className="row-main">
              <div className="row-title" style={{ color: 'var(--text-dim)' }}>
                {item}
              </div>
            </div>
            <div className="row-meta">대기</div>
          </div>
        ))}
      </div>
    </div>
  )
}
