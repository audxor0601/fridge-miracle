import { useState } from 'react'
import { ddayLabel } from '../lib/dates'
import { isExpired } from '../lib/recipes'
import type { StorageItem } from '../lib/types'

/**
 * 기한 지난 재료를 따로 모아 버림을 안내한다.
 *
 * 추천 엔진은 이 재료들을 계산에서 뺀다(getOwnedMap). 빼기만 하고 화면에서
 * 지우면 "버려야 할 게 있다"는 사실까지 같이 사라진다. 그래서 여기 올려놓고,
 * 버림 기록을 남기게 한다. 이 기록이 나중에 '자주 버리는 재료' 화면의 원본이 된다.
 *
 * 2.1: 10개가 넘으면 화면 절반을 차지해서 평소엔 한 줄로 접어둔다.
 */
export default function ExpiredBanner({
  items,
  onDiscard,
}: {
  items: StorageItem[]
  onDiscard: (id: number) => void
}) {
  const [open, setOpen] = useState(false)
  const expired = items.filter((i) => isExpired(i.expires_on))
  if (expired.length === 0) return null

  return (
    <div className="mb-4 rounded-3xl bg-[#fdecea]">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 px-4 text-left"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-danger" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <span className="flex-1 text-sm text-danger">
          기한 지난 재료 <b>{expired.length}개</b>
          <span className="ml-1 text-[#8a1c13]">· 추천에서 뺐어요</span>
        </span>
        <span aria-hidden className={`text-danger transition ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <p className="text-xs leading-relaxed text-[#8a1c13]">
            기한이 지난 것을 쓰라고 권할 수는 없어서 추천 계산에서 뺐어요. 실제로 버리셨다면
            기록해 두세요. 무엇을 자주 버리는지 '버린 기록'에서 볼 수 있어요.
          </p>
          <ul className="mt-3 divide-y divide-danger/10 rounded-2xl bg-surface">
            {expired.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <b>{i.ingredients?.name}</b>
                  <span className="ml-2 text-xs text-danger">{ddayLabel(i.expires_on)}</span>
                </span>
                <button
                  onClick={() => onDiscard(i.id)}
                  className="h-9 shrink-0 rounded-lg bg-[#fdecea] px-3 text-xs font-bold text-danger"
                >
                  버림
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => expired.forEach((i) => onDiscard(i.id))}
            className="mt-3 h-11 w-full rounded-xl bg-danger text-sm font-bold text-white"
          >
            전부 버림으로 기록
          </button>
        </div>
      )}
    </div>
  )
}
