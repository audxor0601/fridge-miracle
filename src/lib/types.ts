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

export const UNITS = ['g', 'ml', '개', '장', '컵', '큰술', '작은술', '봉지', '마리'] as const
