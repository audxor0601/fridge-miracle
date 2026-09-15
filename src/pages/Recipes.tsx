import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ddayLabel } from '../lib/dates'
import { recommend, type RecipeCard } from '../lib/recipes'

export default function Recipes() {
  const [cards, setCards] = useState<RecipeCard[]>([])
  const [pantryCount, setPantryCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    recommend()
      .then(({ cards, pantry }) => {
        setCards(cards)
        setPantryCount(pantry.length)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <header className="mb-8 border-b border-line pb-5">
        <Link to="/fridge" className="text-sm text-muted transition hover:text-sage">
          ← 나의 냉장고
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-sage">오늘 뭐 먹지</h1>
        <p className="mt-1 text-sm text-muted">
          유통기한이 급한 재료를 먼저 쓰는 순서로 골랐습니다
        </p>
      </header>

      {error && (
        <p className="mb-5 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-muted">1,156개 레시피와 맞춰보는 중...</p>
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-12 text-center">
          <p className="text-sm text-muted">
            {pantryCount === 0
              ? '재고를 먼저 넣어주세요.'
              : '재료 절반 이상이 맞는 요리가 없습니다. 재료를 조금 더 넣어보세요.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {cards.map((c) => (
            <li key={c.recipeId}>
              <Link
                to={`/recipes/${c.recipeId}`}
                className="block rounded-2xl border border-line bg-surface p-5 transition hover:border-sage"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold">{c.name}</h2>
                    <p className="mt-1 text-xs text-muted">
                      {[c.category, c.way, c.kcal ? `${Math.round(c.kcal)}kcal` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-lg font-bold text-sage">{Math.round(c.score)}</span>
                    <p className="text-[11px] text-muted">
                      재료 {c.uses.length}/{c.essentialCount}
                    </p>
                  </div>
                </div>

                {/* 왜 이 순서인지 그대로 보여준다. 설명 못 하는 추천은 만들지 않는다. */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.uses.slice(0, 5).map((u) => (
                    <span
                      key={u.ingredientId}
                      className="rounded-full bg-sage/10 px-2 py-0.5 text-xs text-sage-dark"
                    >
                      {u.name}
                      {u.expiresOn && (
                        <span className="ml-1 text-[10px] opacity-70">{ddayLabel(u.expiresOn)}</span>
                      )}
                    </span>
                  ))}
                  {c.missingNames.slice(0, 3).map((n) => (
                    <span key={n} className="rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">
                      {n} 없음
                    </span>
                  ))}
                  {c.missingNames.length > 3 && (
                    <span className="px-1 py-0.5 text-xs text-muted">
                      외 {c.missingNames.length - 3}개 부족
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs text-muted">
        점수 = 65% × 재료 보유율 + 35% × 유통기한 긴급도. 재료 절반 미만은 제외했습니다.
      </p>
    </div>
  )
}
