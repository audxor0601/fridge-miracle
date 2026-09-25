/**
 * /about 에 띄울 지표.
 *
 * 두 종류를 섞는다.
 *   빌드 시점 실측 — scripts/build_metrics.py 가 원본 파일을 직접 세어 만든 metrics.json
 *   지금 이 순간   — 아래 함수들이 DB에 실제로 물어본 값
 *
 * 1.0에서는 화면의 지표를 Math.random()이 만들었다. 그래서 여기서는
 * 숫자마다 출처(스크립트 이름 / 조회 쿼리)를 같이 들고 다닌다.
 */

import { supabase } from './supabase'

/** head:true 라 행은 안 받고 개수만 받는다 */
async function countOf(table: string): Promise<number> {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

export type LiveMetrics = {
  recipes: number
  steps: number
  ingredients: number
  recipeIngredients: number
  /** 카테고리별 재료 수, 많은 순 */
  categories: { name: string; count: number }[]
  /** '기타'가 아닌 비율 */
  categorizedPct: number
  /** 위 조회 전체에 걸린 시간(ms) */
  elapsedMs: number
}

export async function fetchLiveMetrics(): Promise<LiveMetrics> {
  const startedAt = performance.now()

  const [recipes, steps, ingredients, recipeIngredients, cats] = await Promise.all([
    countOf('recipes'),
    // recipe_steps 는 복합 PK라 id 컬럼이 없다
    supabase
      .from('recipe_steps')
      .select('recipe_id', { count: 'exact', head: true })
      .then(({ count }) => count ?? 0),
    countOf('ingredients'),
    countOf('recipe_ingredients'),
    fetchCategories(),
  ])

  const total = cats.reduce((s, c) => s + c.count, 0)
  const etc = cats.find((c) => c.name === '기타')?.count ?? 0

  return {
    recipes,
    steps,
    ingredients,
    recipeIngredients,
    categories: cats,
    categorizedPct: total ? ((total - etc) / total) * 100 : 0,
    elapsedMs: Math.round(performance.now() - startedAt),
  }
}

/** PostgREST에 group by가 없어서 category만 전부 받아 세었다. 1,600행이라 이게 더 싸다 */
async function fetchCategories(): Promise<{ name: string; count: number }[]> {
  const rows: { category: string }[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('ingredients')
      .select('category')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.category, (m.get(r.category) ?? 0) + 1)
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}
