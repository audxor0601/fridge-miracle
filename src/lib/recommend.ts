/**
 * 추천 점수 계산 — 설계서 4장
 *
 * 1.0의 Math.random()을 대체하는 부분이다. 입출력이 있는 코드는 전부 밖에 두고
 * 여기는 순수 계산만 남겼다. 그래야 가중치를 바꿔가며 검증할 수 있다.
 *
 *   urgency(i)      = 1 / (남은일수 + 1)
 *   coverage(r)     = 보유한 필수재료 수 / 레시피 필수재료 수
 *   urgency_norm(r) = min(Σ urgency(보유재료) / 필수재료 수, 1)
 *   score(r)        = 100 × (0.65 × coverage + 0.35 × urgency_norm)
 */

import { daysLeft } from './dates'

/** 가중치. 실제 재고로 돌려보고 조정한다. 조정 이유는 README에 남긴다. */
export const COVERAGE_WEIGHT = 0.65
export const URGENCY_WEIGHT = 0.35
/** 재료 절반도 없는 요리를 추천하면 신뢰를 잃는다 */
export const MIN_COVERAGE = 0.5

export type PantryItem = {
  ingredientId: number
  name: string
  expiresOn: string | null
}

export type EssentialRow = {
  recipe_id: number
  ingredient_id: number
}

export type Scored = {
  recipeId: number
  score: number
  coverage: number
  urgencyNorm: number
  /** 이 요리로 소비하게 되는 내 재료 (급한 순) */
  uses: PantryItem[]
  /** 사야 하는 재료의 id */
  missingIds: number[]
  essentialCount: number
}

export function urgencyOf(expiresOn: string | null): number {
  const d = daysLeft(expiresOn)
  if (d === null) return 0      // 기한을 모르면 급할 이유가 없다
  if (d < 0) return 1           // 이미 지난 것은 최대치 (폐기 후보로 따로 표시)
  return 1 / (d + 1)
}

/**
 * @param pantry    내 재고 (활성 상태만)
 * @param essential 후보 레시피들의 필수재료 전체 목록
 */
export function scoreRecipes(pantry: PantryItem[], essential: EssentialRow[]): Scored[] {
  const mine = new Map(pantry.map((p) => [p.ingredientId, p]))

  // 레시피별로 필수재료를 모은다
  const byRecipe = new Map<number, number[]>()
  for (const row of essential) {
    const list = byRecipe.get(row.recipe_id)
    if (list) list.push(row.ingredient_id)
    else byRecipe.set(row.recipe_id, [row.ingredient_id])
  }

  const out: Scored[] = []

  for (const [recipeId, ingredientIds] of byRecipe) {
    const unique = [...new Set(ingredientIds)]
    if (unique.length === 0) continue

    const uses: PantryItem[] = []
    const missingIds: number[] = []
    for (const id of unique) {
      const has = mine.get(id)
      if (has) uses.push(has)
      else missingIds.push(id)
    }

    const coverage = uses.length / unique.length
    if (coverage < MIN_COVERAGE) continue

    const urgencySum = uses.reduce((sum, p) => sum + urgencyOf(p.expiresOn), 0)
    const urgencyNorm = Math.min(urgencySum / unique.length, 1)
    const score = 100 * (COVERAGE_WEIGHT * coverage + URGENCY_WEIGHT * urgencyNorm)

    uses.sort((a, b) => urgencyOf(b.expiresOn) - urgencyOf(a.expiresOn))

    out.push({
      recipeId,
      score: Math.round(score * 10) / 10,
      coverage,
      urgencyNorm,
      uses,
      missingIds,
      essentialCount: unique.length,
    })
  }

  return out.sort((a, b) => b.score - a.score)
}
