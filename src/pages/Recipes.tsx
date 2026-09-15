import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ddayLabel } from '../lib/dates'
import { recommend, type RecipeCard } from '../lib/recipes'

/** 부족 재료 수로 묶어 보여준다. 사용자가 먼저 보는 것은 '몇 개 사야 하나'다. */
const GROUPS = [
  { max: 0, title: '지금 바로 만들 수 있어요' },
  { max: 1, title: '주재료 1개만 사면 돼요' },
  { max: 2, title: '주재료 2개만 사면 돼요' },
]

export default function Recipes() {
  const [cards, setCards] = useState<RecipeCard[]>([])
  const [pantryCount, setPantryCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    recommend(40)
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
          주재료를 적게 사도 되는 순서. 같은 조건이면 이미 가진 중량이 많은 요리를 먼저 보여줍니다
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
              : '주재료 2개 이내로 만들 수 있는 요리가 없습니다. 재료를 조금 더 넣어보세요.'}
          </p>
        </div>
      ) : (
        GROUPS.map((g) => {
          const items = cards.filter((c) => c.missingMainIds.length === g.max)
          if (items.length === 0) return null
          return (
            <section key={g.max} className="mb-8">
              <h2 className="mb-3 text-sm font-bold text-muted">
                {g.title} <span className="font-normal">· {items.length}개</span>
              </h2>
              <ul className="space-y-3">
                {items.map((c) => (
                  <li key={c.recipeId}>
                    <Link
                      to={`/recipes/${c.recipeId}`}
                      className="block rounded-2xl border border-line bg-surface p-5 transition hover:border-sage"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-base font-bold">{c.name}</h3>
                          <p className="mt-1 text-xs text-muted">
                            {[c.category, c.way, c.kcal ? `${Math.round(c.kcal)}kcal` : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                        <p className="shrink-0 text-xs text-muted">
                          중량 {Math.round(c.weightCoverage * 100)}% 보유
                        </p>
                      </div>

                      {c.missingMainNames.length > 0 && (
                        <p className="mt-3 text-sm">
                          <span className="text-muted">살 것 </span>
                          <span className="font-medium text-clay">
                            {c.missingMainNames.join(', ')}
                          </span>
                        </p>
                      )}
                      {c.missingMinorNames.length > 0 && (
                        <p className="mt-1 text-xs text-muted">
                          적게 들어가는 재료 {c.missingMinorNames.slice(0, 5).join(', ')}
                          {c.missingMinorNames.length > 5 && ` 외 ${c.missingMinorNames.length - 5}개`}
                        </p>
                      )}

                      {c.uses.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {c.uses.map((u) => (
                            <span
                              key={u.ingredientId}
                              className="rounded-full bg-sage/10 px-2 py-0.5 text-xs text-sage-dark"
                            >
                              {u.name}
                              {u.expiresOn && (
                                <span className="ml-1 text-[10px] opacity-70">
                                  {ddayLabel(u.expiresOn)}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}

      <p className="mt-2 text-xs leading-relaxed text-muted">
        레시피 전체 중량의 5% 이상을 차지하는 재료를 주재료로 봅니다. 청양고추 10g처럼
        적게 들어가는 재료는 없어도 된다고 보고 따로 표시합니다. 소금·간장 같은 상비 양념과
        쌀뜨물·육수는 가지고 있다고 계산합니다.
      </p>
    </div>
  )
}
