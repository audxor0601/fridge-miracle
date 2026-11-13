import { useState } from 'react'
import { ddayLabel, daysLeft } from '../lib/dates'
import type { StorageItem } from '../lib/types'
import IngredientIcon from './IngredientIcon'

type Props = {
  items: StorageItem[]
  onConsume: (id: number) => void
  onDiscard: (id: number) => void
  onDelete: (id: number) => void
}

/** '11.14까지' 처럼 짧게. 연도는 홈에서 필요 없다. */
function shortDate(ymd: string | null) {
  if (!ymd) return '기한 미입력'
  const [, m, d] = ymd.split('-')
  return `${Number(m)}.${Number(d)}까지`
}

function tone(expiresOn: string | null) {
  const d = daysLeft(expiresOn)
  if (d === null) return 'text-muted'
  if (d <= 1) return 'text-clay font-bold'
  if (d <= 3) return 'text-[#b45309] font-bold'
  return 'text-muted'
}

export default function ItemList({ items, onConsume, onDiscard, onDelete }: Props) {
  // 먹음은 자주 누르니 늘 보이게, 버림·삭제는 '더보기' 안에 둔다
  const [openId, setOpenId] = useState<number | null>(null)

  if (items.length === 0) {
    return (
      <div className="rounded-3xl bg-surface p-10 text-center">
        <p className="text-sm text-muted">아직 넣은 재료가 없어요.</p>
      </div>
    )
  }

  return (
    <section className="rounded-3xl bg-surface px-4 pb-2 pt-4">
      <h2 className="mb-1 text-[17px] font-extrabold">재고 {items.length}개</h2>
      <ul>
        {items.map((item) => (
          <li key={item.id} className="border-b border-canvas last:border-0">
            <div className="flex min-h-16 items-center gap-3 py-2">
              <IngredientIcon category={item.ingredients?.category} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold">
                  {item.ingredients?.name ?? '(알 수 없는 재료)'}
                  {item.qty !== null && (
                    <span className="ml-1.5 text-[13px] font-normal text-muted">
                      {item.qty}{item.unit}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[13px]">
                  <span className={tone(item.expires_on)}>{ddayLabel(item.expires_on)}</span>
                  <span className="text-muted"> · {shortDate(item.expires_on)}</span>
                </p>
              </div>
              <button
                onClick={() => onConsume(item.id)}
                className="h-9 shrink-0 rounded-[10px] bg-canvas px-3.5 text-[13px] text-[#4e5968]"
              >
                먹음
              </button>
              <button
                onClick={() => setOpenId(openId === item.id ? null : item.id)}
                aria-label={`${item.ingredients?.name} 더보기`}
                aria-expanded={openId === item.id}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-muted"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                  <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
                </svg>
              </button>
            </div>
            {openId === item.id && (
              <div className="flex gap-2 pb-3 pl-14">
                <button
                  onClick={() => onDiscard(item.id)}
                  className="h-9 rounded-[10px] bg-[#fdecea] px-3.5 text-[13px] font-bold text-danger"
                >
                  상해서 버림
                </button>
                <button
                  onClick={() => onDelete(item.id)}
                  className="h-9 rounded-[10px] bg-canvas px-3.5 text-[13px] text-[#4e5968]"
                >
                  기록 없이 삭제
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
