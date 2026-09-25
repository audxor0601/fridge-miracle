/**
 * 추천 점수 계산 — 설계서 4장 (v3)
 *
 * 실제 재고로 두 번 갈아엎었다.
 *   v1  커버리지 50% 하한 → 추천 0건. 레시피 필수재료가 평균 8.6개라 통과 불가
 *   v2  부족 개수 기준   → '된장 두부찌개'가 탈락. 청양고추 10g과 두부 320g을
 *                          똑같이 '부족 1개'로 셌기 때문
 *   v3  중량으로 주재료와 곁가지를 나눈다 ← 지금
 *
 * 주재료  = 레시피 전체 중량의 5% 이상을 차지하는 재료. 없으면 그 요리가 아니다
 * 곁가지  = 나머지. 홍고추 5g, 대파 10g 같은 것들
 */

import { daysLeft } from './dates'

/** 전체 중량에서 이 비율 이상이면 주재료 */
export const MAIN_SHARE = 0.05
/** 수량이 없는 재료의 가정 중량(g). 중앙값에 가깝게 잡았다 */
export const DEFAULT_QTY = 30
/** 주재료를 이 개수보다 많이 사야 하면 오늘 해먹을 수 없다 */
export const MAX_MISSING_MAIN = 2

/**
 * 레시피가 이렇게 뭉뚱그려 적은 재료는 같은 카테고리 재고로 대신할 수 있다.
 * '돼지고기 100g'을 요구하면 대패삼겹살로 만들면 된다.
 * 반대로 '양파'처럼 구체적인 재료는 당근으로 대신할 수 없으므로 여기 넣지 않는다.
 */
export const SUBSTITUTABLE = ['돼지고기', '소고기', '쇠고기', '닭고기', '생선살', '흰살생선', '고기']

/**
 * 이 카테고리 안에서는 부위가 달라도 서로 대신한다.
 * 삼겹살 대신 목살로 구워도 요리는 된다.
 * 해물류는 넣지 않았다. 새우 자리에 오징어를 넣으면 다른 음식이 된다.
 */
export const INTERCHANGEABLE_CATEGORIES = ['돼지고기', '소고기', '닭고기']

/** 사실상 물. 쌀뜨물 300g이 부족하다고 요리를 포기할 사람은 없다 */
export const WATERY = [
  '쌀뜨물', '육수', '물', '채수', '다시마육수', '멸치육수',
  '닭육수', '사골육수', '야채육수', '쇠고기육수', '해물육수',
]

export type PantryItem = {
  ingredientId: number
  name: string
  expiresOn: string | null
}

export type EssentialRow = {
  recipe_id: number
  ingredient_id: number
  qty: number | null
}

export type Scored = {
  recipeId: number
  /** 중량 기준으로 몇 퍼센트를 이미 가지고 있나 */
  weightCoverage: number
  urgencyAvg: number
  uses: PantryItem[]
  /** 반드시 사야 하는 재료 */
  missingMainIds: number[]
  /** 적게 들어가는 재료. 없어도 대충 된다 */
  missingMinorIds: number[]
  essentialCount: number
}

/**
 * 급한 정도. 1.0에서 그대로 가져온 공식이다.
 *
 * d < 0 → 1 은 원래 "기한이 지난 건 제일 급하다"는 뜻이었는데, 그 해석이
 * 8일 지난 순두부를 추천 1순위로 올렸다. 지금은 기한 지난 재료를
 * getOwnedMap에서 미리 걸러내므로 이 분기는 추천 경로에서 안 쓰인다.
 * 방어용으로만 남겨둔다.
 */
export function urgencyOf(expiresOn: string | null): number {
  const d = daysLeft(expiresOn)
  if (d === null) return 0
  if (d < 0) return 1
  return 1 / (d + 1)
}

/**
 * 내 재료를 상위 재료까지 넓힌다. '대패삼겹살'은 '삼겹살'로 끝나므로 삼겹살로도 친다.
 * 한 글자 이름(무·배·김)은 '무화과' 같은 오탐을 부르므로 제외한다.
 * 물 성격의 재료도 여기서 보유 처리한다.
 */
export function expandPantry(
  pantry: PantryItem[],
  dictionary: { id: number; name: string; category?: string }[],
): Map<number, PantryItem | null> {
  const out = new Map<number, PantryItem | null>()
  for (const item of pantry) out.set(item.ingredientId, item)

  for (const entry of dictionary) {
    if (WATERY.includes(entry.name)) out.set(entry.id, null)  // 보유로 치되 소비 재료는 아님
  }

  // ① 접미사: '대패삼겹살'은 '삼겹살'로 끝나므로 삼겹살로도 친다
  for (const item of pantry) {
    for (const entry of dictionary) {
      if (entry.name.length < 2) continue
      if (entry.name === item.name) continue
      if (!item.name.endsWith(entry.name)) continue
      if (!out.has(entry.id)) out.set(entry.id, item)
    }
  }

  // ② 카테고리: 레시피의 '돼지고기'는 같은 카테고리 재고로 대신한다
  const myCategories = new Map<string, PantryItem>()
  const catOf = new Map(dictionary.map((d) => [d.id, d.category ?? '기타']))
  for (const item of pantry) {
    const c = catOf.get(item.ingredientId)
    if (c && c !== '기타' && !myCategories.has(c)) myCategories.set(c, item)
  }
  for (const entry of dictionary) {
    const c = entry.category ?? '기타'
    const generic = SUBSTITUTABLE.includes(entry.name)
    const sameMeat = INTERCHANGEABLE_CATEGORIES.includes(c)
    if (!generic && !sameMeat) continue
    const stand = myCategories.get(c)
    if (stand && !out.has(entry.id)) out.set(entry.id, stand)
  }

  return out
}

export function scoreRecipes(
  owned: Map<number, PantryItem | null>,
  essential: EssentialRow[],
): Scored[] {
  // 레시피별 재료와 중량 (같은 재료가 여러 줄이면 큰 값을 쓴다)
  const byRecipe = new Map<number, Map<number, number>>()
  for (const row of essential) {
    let m = byRecipe.get(row.recipe_id)
    if (!m) byRecipe.set(row.recipe_id, (m = new Map()))
    const q = row.qty ?? DEFAULT_QTY
    m.set(row.ingredient_id, Math.max(q, m.get(row.ingredient_id) ?? 0))
  }

  const out: Scored[] = []

  for (const [recipeId, weights] of byRecipe) {
    const total = [...weights.values()].reduce((a, b) => a + b, 0)
    if (total <= 0) continue

    const usesMap = new Map<number, PantryItem>()
    const missingMainIds: number[] = []
    const missingMinorIds: number[] = []
    let haveWeight = 0

    for (const [id, qty] of weights) {
      const isMain = qty / total >= MAIN_SHARE
      if (owned.has(id)) {
        haveWeight += qty
        const item = owned.get(id)
        if (item) usesMap.set(item.ingredientId, item)   // 물은 소비 목록에 안 넣는다
      } else if (isMain) {
        missingMainIds.push(id)
      } else {
        missingMinorIds.push(id)
      }
    }

    if (usesMap.size === 0) continue                       // 내 재료를 안 쓰면 추천이 아니다
    if (missingMainIds.length > MAX_MISSING_MAIN) continue

    const uses = [...usesMap.values()].sort(
      (a, b) => urgencyOf(b.expiresOn) - urgencyOf(a.expiresOn),
    )
    const urgencyAvg = uses.reduce((s, p) => s + urgencyOf(p.expiresOn), 0) / uses.length

    out.push({
      recipeId,
      weightCoverage: haveWeight / total,
      urgencyAvg,
      uses,
      missingMainIds,
      missingMinorIds,
      essentialCount: weights.size,
    })
  }

  // 살 게 적은 순 → 이미 가진 중량이 많은 순 → 급한 재료를 쓰는 순
  return out.sort(
    (a, b) =>
      a.missingMainIds.length - b.missingMainIds.length ||
      b.weightCoverage - a.weightCoverage ||
      b.urgencyAvg - a.urgencyAvg,
  )
}
