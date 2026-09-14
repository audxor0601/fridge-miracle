import { supabase } from './supabase'
import type { Ingredient, ItemStatus, StorageItem } from './types'

/**
 * 재료 사전 검색. 1,936개 중에서 찾는다.
 * 사용자는 사전에 있는 재료만 고를 수 있다 — ingredients 테이블은
 * RLS상 읽기 전용이고, 자유 입력을 허용하면 레시피 매칭이 깨지기 때문이다.
 */
export async function searchIngredients(query: string): Promise<Ingredient[]> {
  const q = query.trim()
  if (!q) return []

  const { data, error } = await supabase
    .from('ingredients')
    .select('id, name, category, is_seasoning')
    .ilike('name', `%${q}%`)
    .limit(30)

  if (error) throw error

  // 검색어로 시작하는 것 우선, 그다음 짧은 이름 순 ("파" → 대파보다 파가 먼저)
  return (data ?? [])
    .sort((a, b) => {
      const aStarts = a.name.startsWith(q) ? 0 : 1
      const bStarts = b.name.startsWith(q) ? 0 : 1
      if (aStarts !== bStarts) return aStarts - bStarts
      return a.name.length - b.name.length
    })
    .slice(0, 8)
}

/** 내 재고 목록. RLS가 알아서 내 행만 준다 — where user_id 조건이 필요 없다. */
export async function listItems(status: ItemStatus = 'active'): Promise<StorageItem[]> {
  const { data, error } = await supabase
    .from('storage_items')
    .select('*, ingredients(name, category, is_seasoning)')
    .eq('status', status)
    .order('expires_on', { ascending: true, nullsFirst: false })

  if (error) throw error
  return (data ?? []) as StorageItem[]
}

export type NewItem = {
  ingredient_id: number
  qty: number | null
  unit: string | null
  purchased_at: string
  expires_on: string | null
  memo?: string | null
}

export async function addItem(userId: string, item: NewItem): Promise<void> {
  // user_id를 직접 넣어야 한다. RLS의 with check가 auth.uid()와 비교한다.
  const { error } = await supabase.from('storage_items').insert({ ...item, user_id: userId })
  if (error) throw error
}

export async function setStatus(id: number, status: ItemStatus): Promise<void> {
  const { error } = await supabase.from('storage_items').update({ status }).eq('id', id)
  if (error) throw error
}

export async function removeItem(id: number): Promise<void> {
  const { error } = await supabase.from('storage_items').delete().eq('id', id)
  if (error) throw error
}
