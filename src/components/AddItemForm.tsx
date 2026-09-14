import { useEffect, useRef, useState } from 'react'
import { plusDays, today } from '../lib/dates'
import { addItem, searchIngredients, type NewItem } from '../lib/storage'
import type { Ingredient } from '../lib/types'
import { UNITS } from '../lib/types'

type Props = { userId: string; onAdded: () => void }

export default function AddItemForm({ userId, onAdded }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Ingredient[]>([])
  const [picked, setPicked] = useState<Ingredient | null>(null)
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState<string>('g')
  const [expiresOn, setExpiresOn] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const qtyRef = useRef<HTMLInputElement>(null)

  // 입력이 멈추고 200ms 뒤에 검색한다. 글자마다 쏘면 요청이 낭비된다.
  useEffect(() => {
    if (picked || !query.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    const t = setTimeout(() => {
      searchIngredients(query)
        .then(setResults)
        .catch((e) => setError(e.message))
        .finally(() => setSearching(false))
    }, 200)
    return () => clearTimeout(t)
  }, [query, picked])

  function choose(ing: Ingredient) {
    setPicked(ing)
    setQuery(ing.name)
    setResults([])
    qtyRef.current?.focus()
  }

  function reset() {
    setPicked(null)
    setQuery('')
    setQty('')
    setExpiresOn('')
  }

  async function submit() {
    if (!picked) return
    setBusy(true)
    setError(null)
    const item: NewItem = {
      ingredient_id: picked.id,
      qty: qty.trim() ? Number(qty) : null,
      unit: qty.trim() ? unit : null,
      purchased_at: today(),
      expires_on: expiresOn || null,
    }
    try {
      await addItem(userId, item)
      reset()
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-4 text-base font-bold">재료 넣기</h2>

      {/* 재료 검색 */}
      <div className="relative">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPicked(null) }}
          placeholder="재료 이름 (예: 대파, 삼겹살)"
          className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-sage"
        />
        {picked && (
          <span className="absolute right-3 top-2.5 rounded-full bg-sage/10 px-2 py-0.5 text-xs text-sage-dark">
            {picked.is_seasoning ? '양념' : picked.category}
          </span>
        )}

        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => choose(r)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-canvas"
                >
                  <span>{r.name}</span>
                  {r.is_seasoning && <span className="text-xs text-muted">양념</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {!picked && query.trim() && !searching && results.length === 0 && (
          <p className="mt-2 text-xs text-muted">
            사전에 없는 재료입니다. 레시피 매칭을 위해 지금은 사전에 있는 재료만 넣을 수 있습니다.
          </p>
        )}
      </div>

      {/* 수량·단위 */}
      <div className="mt-3 flex gap-2">
        <input
          ref={qtyRef}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          inputMode="decimal"
          placeholder="수량 (선택)"
          className="w-32 rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-sage"
        />
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-sage"
        >
          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {/* 유통기한 */}
      <div className="mt-3">
        <label className="mb-1.5 block text-xs font-medium text-muted">유통기한</label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={expiresOn}
            min={today()}
            onChange={(e) => setExpiresOn(e.target.value)}
            className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-sage"
          />
          {[1, 3, 7, 14].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setExpiresOn(plusDays(d))}
              className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:border-sage hover:text-sage"
            >
              +{d}일
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <button
        onClick={submit}
        disabled={!picked || busy}
        className="mt-4 w-full rounded-lg bg-sage py-2.5 text-sm font-bold text-white transition hover:bg-sage-dark disabled:opacity-40"
      >
        {busy ? '넣는 중...' : '냉장고에 넣기'}
      </button>
    </section>
  )
}
