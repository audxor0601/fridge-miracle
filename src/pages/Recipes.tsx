import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ddayLabel } from '../lib/dates'
import { recommend, type RecipeCard, type RecommendStats } from '../lib/recipes'

/** 부족 재료 수로 묶어 보여준다. 사용자가 먼저 보는 것은 '몇 개 사야 하나'다. */
const GROUPS = [
  { max: 0, title: '지금 바로 만들 수 있어요' },
  { max: 1, title: '주재료 1개만 사면 돼요' },
  { max: 2, title: '주재료 2개만 사면 돼요' },
]

/**
 * 화면 맨 위 한 줄. "그냥 유튜브에 검색하면 되지 않나"에 대한 대답이다.
 * 이 서비스가 대신 해준 일(몇 개 중에서, 무엇을 기준으로, 몇 개를 골랐는지)을
 * 실제 계산에서 나온 숫자로 적는다.
 */
function Summary({ stats }: { stats: RecommendStats }) {
  const n = (v: number) => v.toLocaleString('ko-KR')
  return (
    <div className="mb-6 rounded-2xl border border-sage/25 bg-sage/5 px-4 py-3">
      <p className="text-sm leading-relaxed">
        재료 <b>{stats.pantryCount}개</b>로 레시피 <b>{n(stats.totalRecipes)}개</b>를 맞춰봤습니다.
        {stats.expiredCount > 0 && (
          <>
            {' '}기한이 지난 <b className="text-danger">{stats.expiredCount}개</b>는 계산에서
            뺐습니다.
          </>
        )}
        내 재료가 들어가는 건 <b>{n(stats.matchedRecipes)}개</b>, 그중 내 재료가 가장 많이
        겹치는 <b>{n(stats.examinedRecipes)}개</b>를 중량까지 따져보니 주재료를 2개 이내만 사면
        되는 건 <b>{n(stats.cookableRecipes)}개</b>였습니다.
      </p>
      <p className="mt-1 text-sm leading-relaxed">
        그 <b>{stats.shown}개</b>를 ① 살 주재료가 적은 순 ② 이미 가진 중량이 많은 순
        ③ 유통기한이 급한 재료를 쓰는 순으로 늘어놓았습니다.
        {stats.urgent && (
          <>
            {' '}지금 가장 급한 건{' '}
            <b className="text-clay">
              {stats.urgent.name} {ddayLabel(stats.urgent.expiresOn)}
            </b>
            입니다.
          </>
        )}
        <span className="ml-1 text-xs text-muted">· 계산 {(stats.elapsedMs / 1000).toFixed(1)}초</span>
      </p>
    </div>
  )
}

export default function Recipes() {
  const [cards, setCards] = useState<RecipeCard[]>([])
  const [pantryCount, setPantryCount] = useState(0)
  const [stats, setStats] = useState<RecommendStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    recommend(40)
      .then(({ cards, pantry, stats }) => {
        setCards(cards)
        setPantryCount(pantry.length)
        setStats(stats)
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
      </header>

      {error && (
        <p className="mb-5 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {!loading && stats && cards.length > 0 && <Summary stats={stats} />}

      {loading ? (
        <p className="text-sm text-muted">냉장고 재료와 레시피를 맞춰보는 중...</p>
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-12 text-center">
          <p className="text-sm leading-relaxed text-muted">
            {pantryCount === 0 ? (
              (stats?.expiredCount ?? 0) > 0
                ? `쓸 수 있는 재료가 없습니다. 기한이 지난 ${stats?.expiredCount}개는 계산에서 뺐습니다.`
                : '재고를 먼저 넣어주세요.'
            ) : (
              <>
                재료 {pantryCount}개가 들어가는 레시피는{' '}
                {(stats?.matchedRecipes ?? 0).toLocaleString('ko-KR')}개 찾았지만,
                <br />
                전부 주재료를 3개 이상 사야 하는 것들이었습니다. 재료를 조금 더 넣어보세요.
              </>
            )}
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
