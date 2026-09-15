import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchRecipe, getOwnedMap, type RecipeDetail as Detail } from '../lib/recipes'
import { youtubeQuery, youtubeSearchUrl } from '../lib/youtube'

export default function RecipeDetail() {
  const { id } = useParams()
  const [recipe, setRecipe] = useState<Detail | null>(null)
  const [mine, setMine] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    // 목록과 같은 판정을 쓴다. 순두부를 두부로 쳤으면 상세에서도 그래야 한다.
    Promise.all([fetchRecipe(Number(id)), getOwnedMap()])
      .then(([r, { owned }]) => {
        setRecipe(r)
        setMine(new Set(owned.keys()))
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [id])

  if (error) {
    return <p className="mx-auto max-w-2xl px-5 py-10 text-sm text-danger">{error}</p>
  }
  if (!recipe) {
    return <p className="mx-auto max-w-2xl px-5 py-10 text-sm text-muted">불러오는 중...</p>
  }

  const nutrition = [
    ['열량', recipe.kcal, 'kcal'],
    ['탄수화물', recipe.carb, 'g'],
    ['단백질', recipe.protein, 'g'],
    ['지방', recipe.fat, 'g'],
    ['나트륨', recipe.sodium, 'mg'],
  ] as const

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <Link to="/recipes" className="text-sm text-muted transition hover:text-sage">
        ← 추천 목록
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-sage">{recipe.name}</h1>
      <p className="mt-1 text-sm text-muted">
        {[recipe.category, recipe.way].filter(Boolean).join(' · ')}
      </p>

      {recipe.imageUrl && (
        <img
          src={recipe.imageUrl}
          alt=""
          className="mt-5 w-full rounded-2xl border border-line object-cover"
        />
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-base font-bold">재료</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {recipe.ingredients.map((ing, i) => {
            const have = ing.ingredient_id !== null && mine.has(ing.ingredient_id)
            return (
              <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${have ? 'bg-sage' : 'bg-line'}`}
                />
                <span className={have ? '' : 'text-muted'}>{ing.raw_text}</span>
                {!ing.is_essential && (
                  <span className="ml-auto text-[11px] text-muted">양념</span>
                )}
                {have && ing.is_essential && (
                  <span className="ml-auto text-[11px] text-sage-dark">보유</span>
                )}
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">
          원문 그대로 보여줍니다. 매칭은 표준화한 이름으로 하되, 계량은 원문이 정확합니다.
        </p>
      </section>

      <section className="mt-8">
        {/* 조리 단계를 읽기 시작하는 지점에 둔다. 원본이 6단계에서 잘려 있어
            "영상으로 보면 낫겠다" 싶어지는 자리가 정확히 여기다. */}
        <a
          href={youtubeSearchUrl(recipe.name)}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-4 transition hover:border-sage"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-8 w-11 shrink-0 items-center justify-center rounded-lg bg-danger/90">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span>
              <span className="block text-sm font-bold">보면서 따라 만들기</span>
              <span className="block text-xs text-muted">
                유튜브에서 "{youtubeQuery(recipe.name)}" 검색
              </span>
            </span>
          </span>
          <span className="shrink-0 text-xs text-muted">새 탭 ↗</span>
        </a>

        <h2 className="mb-3 text-base font-bold">만드는 법</h2>
        <ol className="space-y-3">
          {recipe.steps.map((s) => (
            <li key={s.step_no} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage text-[11px] font-bold text-white">
                {s.step_no}
              </span>
              <p className="text-sm leading-relaxed">{s.text}</p>
            </li>
          ))}
        </ol>
        {recipe.steps.length >= 6 && (
          <p className="mt-3 text-xs text-muted">
            원본 데이터가 6단계까지만 제공합니다. 뒷부분이 잘려 보일 수 있습니다.
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-base font-bold">영양 (1인분)</h2>
        <div className="grid grid-cols-5 gap-2">
          {nutrition.map(([label, value, unit]) => (
            <div key={label} className="rounded-xl border border-line bg-surface px-2 py-3 text-center">
              <p className="text-[11px] text-muted">{label}</p>
              <p className="mt-1 text-sm font-bold">
                {value === null ? '-' : Math.round(Number(value))}
                <span className="ml-0.5 text-[10px] font-normal text-muted">{unit}</span>
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
