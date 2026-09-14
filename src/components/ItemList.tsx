import { ddayLabel, ddayTone, daysLeft } from '../lib/dates'
import type { StorageItem } from '../lib/types'

type Props = {
  items: StorageItem[]
  onConsume: (id: number) => void
  onDiscard: (id: number) => void
  onDelete: (id: number) => void
}

export default function ItemList({ items, onConsume, onDiscard, onDelete }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-12 text-center">
        <p className="text-sm text-muted">아직 넣은 재료가 없습니다.</p>
      </div>
    )
  }

  const expired = items.filter((i) => (daysLeft(i.expires_on) ?? 99) < 0)
  const urgent = items.filter((i) => {
    const d = daysLeft(i.expires_on)
    return d !== null && d >= 0 && d <= 3
  })

  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-base font-bold">재고 {items.length}개</h2>
        {urgent.length > 0 && (
          <span className="text-xs text-clay">3일 내 소비 {urgent.length}개</span>
        )}
        {expired.length > 0 && (
          <span className="text-xs text-danger">기한 지남 {expired.length}개</span>
        )}
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className={`w-20 shrink-0 rounded-full py-1 text-center text-xs font-bold ${ddayTone(item.expires_on)}`}
            >
              {ddayLabel(item.expires_on)}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {item.ingredients?.name ?? '(알 수 없는 재료)'}
                {item.qty !== null && (
                  <span className="ml-2 text-xs font-normal text-muted">
                    {item.qty}{item.unit}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {item.expires_on ?? '기한 미입력'} · {item.purchased_at} 구입
              </p>
            </div>

            <div className="flex shrink-0 gap-1">
              <button
                onClick={() => onConsume(item.id)}
                title="다 먹었음"
                className="rounded-md px-2 py-1 text-xs text-muted transition hover:bg-sage/10 hover:text-sage-dark"
              >
                먹음
              </button>
              <button
                onClick={() => onDiscard(item.id)}
                title="상해서 버림"
                className="rounded-md px-2 py-1 text-xs text-muted transition hover:bg-clay/10 hover:text-clay"
              >
                버림
              </button>
              <button
                onClick={() => onDelete(item.id)}
                title="기록에서 지움"
                className="rounded-md px-2 py-1 text-xs text-muted transition hover:bg-danger/10 hover:text-danger"
              >
                삭제
              </button>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-muted">
        먹음·버림은 기록으로 남습니다. 나중에 무엇을 자주 버리는지 보려면 이 기록이 필요합니다.
      </p>
    </section>
  )
}
