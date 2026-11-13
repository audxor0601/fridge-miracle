import { useEffect, useRef, useState } from 'react'
import { plusDays, today } from '../lib/dates'
import { addItem, frequentIngredients, searchIngredients, type NewItem } from '../lib/storage'
import type { Ingredient } from '../lib/types'
import { UNITS } from '../lib/types'
import IngredientIcon from './IngredientIcon'

type Props = { userId: string; onAdded: () => void }

/** 단위마다 −/+ 한 번에 움직일 양. 500g 사면서 1g씩 누를 수는 없다. */
function stepOf(unit: string) {
  if (unit === 'g' || unit === 'ml') return 50
  if (unit === 'kg' || unit === 'L') return 0.5
  return 1
}

/** 유통기한 빠른 선택. '직접'은 날짜 칸을 연다 */
const QUICK_DAYS = [3, 7, 14]

/** 자주 쓰는 단위만 버튼으로, 나머지는 '기타' 목록으로 */
const COMMON_UNITS = ['개', 'g', 'kg', 'ml', 'L', '봉지']
const OTHER_UNITS = UNITS.filter((u) => !COMMON_UNITS.includes(u))

function shortDate(ymd: string) {
  const [, m, d] = ymd.split('-')
  return `${Number(m)}.${Number(d)}`
}

export default function AddItemForm({ userId, onAdded }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Ingredient[]>([])
  const [frequent, setFrequent] = useState<Ingredient[]>([])
  const [picked, setPicked] = useState<Ingredient | null>(null)
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState<string>('개')
  const [expiresOn, setExpiresOn] = useState('')
  const [custom, setCustom] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    frequentIngredients().then(setFrequent).catch(() => setFrequent([]))
  }, [])

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
  }

  function bump(dir: 1 | -1) {
    const now = qty.trim() ? Number(qty) : 0
    const next = Math.max(0, Math.round((now + dir * stepOf(unit)) * 10) / 10)
    setQty(next === 0 ? '' : String(next))
  }

  function pickDays(d: number) {
    setCustom(false)
    setExpiresOn(plusDays(d))
  }

  function reset() {
    setPicked(null)
    setQuery('')
    setQty('')
    setExpiresOn('')
    setCustom(false)
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

  const label = 'mb-2 mt-5 block text-[13px] font-bold text-[#4e5968]'

  return (
    <div>
      {/* 재료 검색 */}
      <div className="relative">
        <label htmlFor="ing-search" className="sr-only">재료 이름</label>
        <div className="flex h-[52px] items-center gap-2.5 rounded-2xl bg-canvas px-3.5">
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            id="ing-search"
            ref={searchRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPicked(null) }}
            placeholder="재료 이름 (예: 대파, 삼겹살)"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-base font-bold outline-none placeholder:font-normal placeholder:text-muted"
          />
          {picked && (
            <span className="shrink-0 rounded-full bg-sage/10 px-2 py-0.5 text-xs text-sage-dark">
              {picked.is_seasoning ? '양념' : picked.category}
            </span>
          )}
        </div>

        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => choose(r)}
                  className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-[15px] hover:bg-canvas"
                >
                  <IngredientIcon category={r.category} size={32} />
                  <span className="flex-1">{r.name}</span>
                  {r.is_seasoning && <span className="text-xs text-muted">양념</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {!picked && query.trim() && !searching && results.length === 0 && (
          <p className="mt-2 text-xs text-muted">
            사전에 없는 재료예요. 레시피와 맞춰보려면 지금은 사전에 있는 재료만 넣을 수 있어요.
          </p>
        )}
      </div>

      {/* 자주 넣는 재료 */}
      {frequent.length > 0 && (
        <>
          <p className={label}>자주 넣는 재료</p>
          <div className="flex flex-wrap gap-2">
            {frequent.map((f) => {
              const on = picked?.id === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => choose(f)}
                  aria-pressed={on}
                  className={`flex h-10 items-center gap-1.5 rounded-full pl-1.5 pr-3 text-sm ${
                    on ? 'border-[1.5px] border-sage bg-sage/10 font-bold text-sage-dark' : 'border border-line bg-surface text-[#333d4b]'
                  }`}
                >
                  <IngredientIcon category={f.category} size={28} />
                  {f.name}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* 수량·단위 */}
      <p className={label}>얼마나 <span className="font-normal text-muted">(선택)</span></p>
      <div className="flex items-center gap-2.5">
        <div className="flex h-12 shrink-0 items-center rounded-2xl border border-line">
          <button type="button" onClick={() => bump(-1)} aria-label="줄이기" className="h-full w-11 text-xl text-[#4e5968]">−</button>
          <label htmlFor="qty" className="sr-only">수량</label>
          <input
            id="qty"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="w-12 bg-transparent text-center text-[17px] font-extrabold outline-none"
          />
          <button type="button" onClick={() => bump(1)} aria-label="늘리기" className="h-full w-11 text-xl text-[#4e5968]">+</button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {COMMON_UNITS.map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setUnit(u)}
            aria-pressed={unit === u}
            className={`h-10 min-w-11 rounded-xl px-3 text-sm ${
              unit === u ? 'bg-ink font-bold text-white' : 'bg-canvas text-[#4e5968]'
            }`}
          >
            {u}
          </button>
        ))}
        <label htmlFor="unit-other" className="sr-only">다른 단위</label>
        <select
          id="unit-other"
          value={COMMON_UNITS.includes(unit) ? '' : unit}
          onChange={(e) => e.target.value && setUnit(e.target.value)}
          className={`h-10 rounded-xl px-3 text-sm outline-none ${
            COMMON_UNITS.includes(unit) ? 'bg-canvas text-[#4e5968]' : 'bg-ink font-bold text-white'
          }`}
        >
          <option value="">기타 단위</option>
          {OTHER_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {/* 유통기한 */}
      <p className={label}>언제까지 먹어야 해요</p>
      <div className="grid grid-cols-4 gap-1.5">
        {QUICK_DAYS.map((d) => {
          const on = !custom && expiresOn === plusDays(d)
          return (
            <button
              key={d}
              type="button"
              onClick={() => pickDays(d)}
              aria-pressed={on}
              className={`h-[52px] rounded-xl text-sm leading-tight ${
                on ? 'border-[1.5px] border-sage bg-sage/10 font-bold text-sage-dark' : 'bg-canvas text-[#4e5968]'
              }`}
            >
              {d}일
              <span className="block text-[11px] font-normal">{shortDate(plusDays(d))}</span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => { setCustom(true); setExpiresOn('') }}
          aria-pressed={custom}
          className={`h-[52px] rounded-xl text-sm ${
            custom ? 'border-[1.5px] border-sage bg-sage/10 font-bold text-sage-dark' : 'bg-canvas text-[#4e5968]'
          }`}
        >
          직접
        </button>
      </div>
      {custom && (
        <>
          <label htmlFor="exp" className="sr-only">유통기한 날짜</label>
          <input
            id="exp"
            type="date"
            value={expiresOn}
            min={today()}
            onChange={(e) => setExpiresOn(e.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-line bg-surface px-3.5 text-base outline-none focus:border-sage"
          />
        </>
      )}
      {!expiresOn && !custom && (
        <p className="mt-2 text-xs text-muted">안 고르면 기한 없이 들어가요. 기한이 있어야 급한 재료로 알려드릴 수 있어요.</p>
      )}

      {error && (
        <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <button
        onClick={submit}
        disabled={!picked || busy}
        className="mt-6 h-14 w-full rounded-2xl bg-sage text-base font-bold text-white transition disabled:opacity-40"
      >
        {busy ? '넣는 중...' : picked ? `${picked.name} 냉장고에 넣기` : '재료를 먼저 골라주세요'}
      </button>
    </div>
  )
}
