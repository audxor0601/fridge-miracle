import { ddayLabel } from '../lib/dates'
import { isExpired } from '../lib/recipes'
import type { StorageItem } from '../lib/types'

/**
 * 기한 지난 재료를 따로 모아 버림을 안내한다.
 *
 * 추천 엔진은 이 재료들을 계산에서 뺀다(getOwnedMap). 빼기만 하고 화면에서
 * 지우면 "버려야 할 게 있다"는 사실까지 같이 사라진다. 그래서 여기 올려놓고,
 * 버림 기록을 남기게 한다. 이 기록이 나중에 '자주 버리는 재료' 화면의 원본이 된다.
 */
export default function ExpiredBanner({
  items,
  onDiscard,
}: {
  items: StorageItem[]
  onDiscard: (id: number) => void
}) {
  const expired = items.filter((i) => isExpired(i.expires_on))
  if (expired.length === 0) return null

  return (
    <div className="mb-6 rounded-2xl border border-danger/30 bg-danger/5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-danger">
          기한이 지난 재료 {expired.length}개
        </p>
        <button
          onClick={() => expired.forEach((i) => onDiscard(i.id))}
          className="rounded-lg border border-danger/40 px-3 py-1 text-xs font-bold text-danger transition hover:bg-danger/10"
        >
          전부 버림으로 기록
        </button>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        이 재료들은 추천 계산에서 뺐습니다. 기한이 지난 것을 쓰라고 권할 수는 없습니다.
        실제로 버리셨다면 기록해 두세요. 무엇을 자주 버리는지 나중에 볼 수 있습니다.
      </p>
      <ul className="mt-3 space-y-1.5">
        {expired.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0">
              <b>{i.ingredients?.name}</b>
              <span className="ml-2 text-xs text-danger">{ddayLabel(i.expires_on)}</span>
            </span>
            <button
              onClick={() => onDiscard(i.id)}
              className="shrink-0 text-xs text-muted transition hover:text-danger"
            >
              버림
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
