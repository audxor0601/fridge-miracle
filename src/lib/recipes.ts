import { daysLeft } from './dates'
import { expandPantry, scoreRecipes, urgencyOf, type PantryItem, type Scored } from './recommend'
import { supabase } from './supabase'
import { listItems } from './storage'

/** 후보가 너무 많으면 조회 URL이 길어진다. 매칭 수가 많은 순으로 잘라 쓴다. */
const CANDIDATE_LIMIT = 200

export type RecipeCard = Scored & {
  name: string
  category: string | null
  way: string | null
  kcal: number | null
  imageUrl: string | null
  missingMainNames: string[]
  missingMinorNames: string[]
}

/** PostgREST는 한 번에 1000행까지만 주므로 나눠 받는다. */
async function fetchDictionary(): Promise<{ id: number; name: string; category: string }[]> {
  const out: { id: number; name: string; category: string }[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('ingredients')
      .select('id, name, category')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return out
}

/**
 * 내 재고를 '보유로 인정되는 재료 id' 맵으로 바꾼다.
 * 목록과 상세가 같은 판정을 쓰도록 여기 한 곳에 둔다.
 */
/** 기한이 지났으면 먹을 재료가 아니다. 버릴 재료다. */
export function isExpired(expiresOn: string | null): boolean {
  const d = daysLeft(expiresOn)
  return d !== null && d < 0
}

export async function getOwnedMap(): Promise<{
  owned: Map<number, PantryItem | null>
  pantry: PantryItem[]
  expired: PantryItem[]
}> {
  const items = await listItems('active')
  const all: PantryItem[] = items.map((i) => ({
    ingredientId: i.ingredient_id,
    name: i.ingredients?.name ?? '',
    expiresOn: i.expires_on,
  }))

  // 기한 지난 재료는 추천 계산에서 뺀다.
  //
  // 1.0에서 물려받은 urgency = 1/(남은일수+1) 공식은 기한이 지나면 1을 돌려준다.
  // "가까울수록 급하다"를 끝까지 민 결과인데, 먹는 서비스에서는 틀린 답이다.
  // 8일 지난 순두부로 찌개를 끓이라고 권하게 된다. 지난 건 쓰라고 할 게 아니라
  // 버리라고 해야 한다. 그래서 여기서 갈라놓고, 냉장고 화면이 버림을 안내한다.
  const expired = all.filter((i) => isExpired(i.expiresOn))
  const pantry = all.filter((i) => !isExpired(i.expiresOn))

  if (pantry.length === 0) return { owned: new Map(), pantry, expired }
  const dictionary = await fetchDictionary()
  return { owned: expandPantry(pantry, dictionary), pantry, expired }
}

/**
 * 화면 맨 위에 '무엇을 근거로 골랐는지' 한 줄로 적기 위한 수치.
 * 전부 이 함수가 실제로 조회하고 계산한 값이다. 하드코딩한 숫자는 없다.
 */
export type RecommendStats = {
  /** 추천 계산에 실제로 쓴 재료 수 (기한 지난 것 제외) */
  pantryCount: number
  /** 기한이 지나 계산에서 뺀 재료 수 */
  expiredCount: number
  /** DB에 있는 전체 레시피 수 */
  totalRecipes: number
  /** 내 재료가 하나라도 필수로 들어가는 레시피 수 */
  matchedRecipes: number
  /** 그중 중량까지 따져본 수 (CANDIDATE_LIMIT) */
  examinedRecipes: number
  /** 따져본 것 중 주재료를 2개 이내만 사면 되는 레시피 수 */
  cookableRecipes: number
  /** 화면에 실제로 띄운 수 */
  shown: number
  /** 추천에 실제로 쓰인 재고 중 가장 급한 것 */
  urgent: PantryItem | null
  /** 추천 계산에 걸린 시간(ms) */
  elapsedMs: number
}

const EMPTY_STATS: RecommendStats = {
  pantryCount: 0, expiredCount: 0, totalRecipes: 0, matchedRecipes: 0, examinedRecipes: 0,
  cookableRecipes: 0, shown: 0, urgent: null, elapsedMs: 0,
}

export async function recommend(limit = 20): Promise<{
  cards: RecipeCard[]
  pantry: PantryItem[]
  expired: PantryItem[]
  stats: RecommendStats
}> {
  const startedAt = performance.now()
  const { owned, pantry, expired } = await getOwnedMap()
  if (pantry.length === 0) {
    return { cards: [], pantry, expired, stats: { ...EMPTY_STATS, expiredCount: expired.length } }
  }
  const myIds = [...owned.keys()]

  // 1) 내 재료가 필수로 들어가는 레시피 찾기 (+ 전체 레시피 수)
  const [{ data: hits, error: e1 }, { count: totalRecipes }] = await Promise.all([
    supabase
      .from('recipe_ingredients')
      .select('recipe_id')
      .in('ingredient_id', myIds)
      .eq('is_essential', true),
    supabase.from('recipes').select('id', { count: 'exact', head: true }),
  ])
  if (e1) throw e1

  const hitCount = new Map<number, number>()
  for (const h of hits ?? []) {
    hitCount.set(h.recipe_id, (hitCount.get(h.recipe_id) ?? 0) + 1)
  }
  const candidates = [...hitCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CANDIDATE_LIMIT)
    .map(([id]) => id)

  const base: RecommendStats = {
    ...EMPTY_STATS,
    pantryCount: pantry.length,
    expiredCount: expired.length,
    totalRecipes: totalRecipes ?? 0,
    matchedRecipes: hitCount.size,
    examinedRecipes: candidates.length,
  }
  if (candidates.length === 0) return { cards: [], pantry, expired, stats: base }

  // 2) 후보들의 필수재료 전체 (커버리지 분모)
  const { data: essential, error: e2 } = await supabase
    .from('recipe_ingredients')
    .select('recipe_id, ingredient_id, qty')
    .in('recipe_id', candidates)
    .eq('is_essential', true)
    .not('ingredient_id', 'is', null)
  if (e2) throw e2

  const scored = scoreRecipes(owned, (essential ?? []) as { recipe_id: number; ingredient_id: number; qty: number | null }[])
  const top = scored.slice(0, limit)

  // 추천에 실제로 쓰인 재고 중 가장 급한 것. 기한을 적지 않은 재료는 후보에서 뺀다
  const used = new Map<number, PantryItem>()
  for (const t of top) for (const u of t.uses) used.set(u.ingredientId, u)
  const urgent =
    [...used.values()]
      .filter((u) => u.expiresOn)
      .sort((a, b) => urgencyOf(b.expiresOn) - urgencyOf(a.expiresOn))[0] ?? null

  const stats: RecommendStats = {
    ...base,
    cookableRecipes: scored.length,
    shown: top.length,
    urgent,
    elapsedMs: Math.round(performance.now() - startedAt),
  }
  if (top.length === 0) return { cards: [], pantry, expired, stats }

  // 3) 화면에 쓸 이름들
  const [{ data: recipes }, { data: ings }] = await Promise.all([
    supabase
      .from('recipes')
      .select('id, name, category, way, kcal, image_url')
      .in('id', top.map((t) => t.recipeId)),
    supabase
      .from('ingredients')
      .select('id, name')
      .in(
        'id',
        [...new Set(top.flatMap((t) => [...t.missingMainIds, ...t.missingMinorIds]))].slice(0, 500),
      ),
  ])

  const recipeById = new Map((recipes ?? []).map((r) => [r.id, r]))
  const nameById = new Map((ings ?? []).map((g) => [g.id, g.name]))

  // 이름 조회까지 끝난 시점이 실제 체감 시간이다
  stats.elapsedMs = Math.round(performance.now() - startedAt)

  return {
    pantry,
    expired,
    stats,
    cards: top.map((t) => {
      const r = recipeById.get(t.recipeId)
      return {
        ...t,
        name: r?.name ?? '(이름 없음)',
        category: r?.category ?? null,
        way: r?.way ?? null,
        kcal: r?.kcal ?? null,
        imageUrl: r?.image_url ?? null,
        missingMainNames: t.missingMainIds.map((id) => nameById.get(id)).filter(Boolean) as string[],
        missingMinorNames: t.missingMinorIds.map((id) => nameById.get(id)).filter(Boolean) as string[],
      }
    }),
  }
}

export type RecipeDetail = {
  id: number
  name: string
  category: string | null
  way: string | null
  kcal: number | null
  carb: number | null
  protein: number | null
  fat: number | null
  sodium: number | null
  imageUrl: string | null
  steps: { step_no: number; text: string }[]
  ingredients: { raw_text: string; ingredient_id: number | null; is_essential: boolean }[]
}

export async function fetchRecipe(id: number): Promise<RecipeDetail> {
  const { data, error } = await supabase
    .from('recipes')
    .select(`
      id, name, category, way, kcal, carb, protein, fat, sodium, image_url,
      recipe_steps(step_no, text),
      recipe_ingredients(raw_text, ingredient_id, is_essential)
    `)
    .eq('id', id)
    .single()
  if (error) throw error

  const row = data as unknown as {
    id: number; name: string; category: string | null; way: string | null
    kcal: number | null; carb: number | null; protein: number | null
    fat: number | null; sodium: number | null; image_url: string | null
    recipe_steps: { step_no: number; text: string }[]
    recipe_ingredients: { raw_text: string; ingredient_id: number | null; is_essential: boolean }[]
  }

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    way: row.way,
    kcal: row.kcal,
    carb: row.carb,
    protein: row.protein,
    fat: row.fat,
    sodium: row.sodium,
    imageUrl: row.image_url,
    steps: [...row.recipe_steps].sort((a, b) => a.step_no - b.step_no),
    ingredients: row.recipe_ingredients,
  }
}
