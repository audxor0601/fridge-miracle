/** DB 스키마와 1:1로 맞춘 타입. supabase/migrations/0001_init.sql 참고 */

export type Ingredient = {
  id: number
  name: string
  category: string
  is_seasoning: boolean
}

export type ItemStatus = 'active' | 'consumed' | 'discarded'

export type StorageItem = {
  id: number
  user_id: string
  ingredient_id: number
  qty: number | null
  unit: string | null
  purchased_at: string      // 'YYYY-MM-DD'
  expires_on: string | null
  status: ItemStatus
  memo: string | null
  /** 상태가 바뀐 시각. 먹음·버림 처리한 시점이 여기 찍힌다 (storage_items_touch 트리거) */
  updated_at: string
  /** 조인해서 같이 받아오는 재료 정보 */
  ingredients: Pick<Ingredient, 'name' | 'category' | 'is_seasoning'> | null
}

/**
 * 재고 등록 화면의 단위 목록.
 *
 * 무게(g/kg) → 부피(ml/L) → 개수 세는 말 순서로 둔다.
 * kg과 L이 빠져 있었다. 쌀 2kg, 우유 1L처럼 큰 단위로 사는 것들이 있는데
 * g와 ml만 있으면 2000, 1000을 직접 계산해서 넣어야 했다.
 */
export const UNITS = [
  'g', 'kg', 'ml', 'L',
  '개', '장', '컵', '큰술', '작은술', '봉지', '마리', '모', '쪽', '단', '팩', '병',
] as const
