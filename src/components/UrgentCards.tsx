import { daysLeft, ddayLabel } from '../lib/dates'
import type { StorageItem } from '../lib/types'
import IngredientIcon from './IngredientIcon'

/** 3일 안에 써야 하는 재료를 가로로 넘기는 카드로. 홈에서 제일 먼저 보여야 할 것. */
export function urgentItems(items: StorageItem[]) {
  return items
    .filter((i) => {
      const d = daysLeft(i.expires_on)
      return d !== null && d >= 0 && d <= 3
    })
    .sort((a, b) => (daysLeft(a.expires_on) ?? 0) - (daysLeft(b.expires_on) ?? 0))
}

export default function UrgentCards({ items }: { items: StorageItem[] }) {
  if (items.length === 0) return null
  return (
    <ul className="-mx-5 flex snap-x scroll-px-5 gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
      {items.map((i) => {
        const d = daysLeft(i.expires_on) ?? 0
        return (
          <li key={i.id} className="w-[140px] shrink-0 snap-start rounded-3xl bg-surface p-3.5">
            <div className="flex items-start justify-between">
              <IngredientIcon category={i.ingredients?.category} />
              <span className={`text-[22px] font-extrabold tracking-tight ${d <= 1 ? 'text-clay' : 'text-[#b45309]'}`}>
                {ddayLabel(i.expires_on)}
              </span>
            </div>
            <p className="mt-2.5 truncate text-[15px] font-bold">{i.ingredients?.name}</p>
            <p className="mt-0.5 text-xs text-muted">
              {i.qty !== null ? `${i.qty}${i.unit ?? ''}` : '양 미입력'}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
