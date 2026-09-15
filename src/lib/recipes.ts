import { scoreRecipes, type PantryItem, type Scored } from './recommend'
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
  missingNames: string[]
}

export async function recommend(limit = 20): Promise<{
  cards: RecipeCard[]
  pantry: PantryItem[]
}> {
  const items = await listItems('active')
  const pantry: PantryItem[] = items.map((i) => ({
    ingredientId: i.ingredient_id,
    name: i.ingredients?.name ?? '',
    expiresOn: i.expires_on,
  }))
  if (pantry.length === 0) return { cards: [], pantry }

  const myIds = [...new Set(pantry.map((p) => p.ingredientId))]

  // 1) 내 재료가 필수로 들어가는 레시피 찾기
  const { data: hits, error: e1 } = await supabase
    .from('recipe_ingredients')
    .select('recipe_id')
    .in('ingredient_id', myIds)
    .eq('is_essential', true)
  if (e1) throw e1

  const hitCount = new Map<number, number>()
  for (const h of hits ?? []) {
    hitCount.set(h.recipe_id, (hitCount.get(h.recipe_id) ?? 0) + 1)
  }
  const candidates = [...hitCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CANDIDATE_LIMIT)
    .map(([id]) => id)
  if (candidates.length === 0) return { cards: [], pantry }

  // 2) 후보들의 필수재료 전체 (커버리지 분모)
  const { data: essential, error: e2 } = await supabase
    .from('recipe_ingredients')
    .select('recipe_id, ingredient_id')
    .in('recipe_id', candidates)
    .eq('is_essential', true)
    .not('ingredient_id', 'is', null)
  if (e2) throw e2

  const scored = scoreRecipes(pantry, essential as { recipe_id: number; ingredient_id: number }[])
  const top = scored.slice(0, limit)
  if (top.length === 0) return { cards: [], pantry }

  // 3) 화면에 쓸 이름들
  const [{ data: recipes }, { data: ings }] = await Promise.all([
    supabase
      .from('recipes')
      .select('id, name, category, way, kcal, image_url')
      .in('id', top.map((t) => t.recipeId)),
    supabase
      .from('ingredients')
      .select('id, name')
      .in('id', [...new Set(top.flatMap((t) => t.missingIds))].slice(0, 500)),
  ])

  const recipeById = new Map((recipes ?? []).map((r) => [r.id, r]))
  const nameById = new Map((ings ?? []).map((g) => [g.id, g.name]))

  return {
    pantry,
    cards: top.map((t) => {
      const r = recipeById.get(t.recipeId)
      return {
        ...t,
        name: r?.name ?? '(이름 없음)',
        category: r?.category ?? null,
        way: r?.way ?? null,
        kcal: r?.kcal ?? null,
        imageUrl: r?.image_url ?? null,
        missingNames: t.missingIds.map((id) => nameById.get(id)).filter(Boolean) as string[],
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
