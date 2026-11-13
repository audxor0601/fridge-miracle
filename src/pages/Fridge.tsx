import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AddItemForm from '../components/AddItemForm'
import ExpiredBanner from '../components/ExpiredBanner'
import ItemList from '../components/ItemList'
import UrgentCards, { urgentItems } from '../components/UrgentCards'
import { useAuth } from '../lib/auth'
import { isExpired } from '../lib/recipes'
import { listItems, removeItem, setStatus } from '../lib/storage'
import type { StorageItem } from '../lib/types'

export default function Fridge() {
  const { user } = useAuth()
  const [items, setItems] = useState<StorageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      setItems(await listItems('active'))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function act(fn: () => Promise<void>) {
    try {
      await fn()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const urgent = urgentItems(items)
  // 기한 지난 것은 위의 빨간 상자에서 따로 다루므로 목록에서는 뺀다
  const fresh = items.filter((i) => !isExpired(i.expires_on))

  return (
    <div className="mx-auto max-w-2xl px-5 pt-12 pb-24">
      <header className="mb-4">
        <p className="text-[17px] font-extrabold text-sage">냉장고의기적</p>
        <h1 className="mt-2 text-[25px] leading-snug">
          {urgent.length > 0 ? (
            <>급한 재료가 <span className="text-clay">{urgent.length}개</span> 있어요</>
          ) : (
            <>3일 안에 급한 재료는 없어요</>
          )}
        </h1>
      </header>

      {error && (
        <p className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-muted">불러오는 중...</p>
      ) : (
        <>
          <UrgentCards items={urgent} />

          <Link
            to="/recipes"
            className="mb-4 mt-3 flex h-[54px] items-center justify-center rounded-2xl bg-sage text-base font-bold text-white"
          >
            {urgent.length > 0 ? '급한 재료로 만들 레시피 보기' : '지금 재료로 만들 레시피 보기'}
          </Link>

          <ExpiredBanner items={items} onDiscard={(id) => act(() => setStatus(id, 'discarded'))} />

          <ItemList
            items={fresh}
            onConsume={(id) => act(() => setStatus(id, 'consumed'))}
            onDiscard={(id) => act(() => setStatus(id, 'discarded'))}
            onDelete={(id) => act(() => removeItem(id))}
          />
        </>
      )}

      <button
        onClick={() => setAdding(true)}
        className="fixed right-[max(20px,calc((100vw-42rem)/2+20px))] z-10 flex h-14 items-center gap-1.5 rounded-full bg-ink pl-4 pr-5 text-[15px] font-bold text-white shadow-[0_8px_22px_rgba(25,31,40,0.28)] bottom-[calc(84px+env(safe-area-inset-bottom))]"
      >
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        재료 넣기
      </button>

      {adding && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40" onClick={() => setAdding(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="재료 넣기"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-surface px-5 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" aria-hidden />
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[22px] font-extrabold">재료 넣기</h2>
              <button
                onClick={() => setAdding(false)}
                aria-label="닫기"
                className="-mr-2 flex h-11 w-11 items-center justify-center text-[#4e5968]"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <AddItemForm
              userId={user!.id}
              onAdded={() => {
                setAdding(false)
                void load()
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
