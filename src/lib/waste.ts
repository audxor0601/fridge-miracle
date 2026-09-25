import { supabase } from './supabase'
import type { StorageItem } from './types'

/**
 * 버림 기록 집계.
 *
 * 규칙 하나를 먼저 정하고 시작했다. **표본이 적으면 비율을 내지 않는다.**
 * 기록 3건으로 "버림률 33%"를 띄우면 그건 1.0의 Math.random()과 같은 자리에
 * 놓인다. 숫자가 그럴듯해 보이는 것과 그 숫자가 뭔가를 말해주는 것은 다르다.
 * 표본이 모자라면 건수만 보여주고, 몇 건이 더 필요한지 화면에 적는다.
 */
export const MIN_SAMPLE = 10
/** 평균을 낼 최소 건수. 비율(10건)보다 낮지만, 1건으로 '평균'이라고 쓸 수는 없다 */
export const MIN_AVG_SAMPLE = 3

export type WasteRow = {
  name: string
  category: string
  discarded: number
  consumed: number
}

export type WasteStats = {
  consumed: number
  discarded: number
  /** 표본이 MIN_SAMPLE 이상일 때만 값이 있다 */
  discardRate: number | null
  /** 비율을 내려면 몇 건이 더 필요한가 */
  needMore: number
  /** 버린 재료별 집계, 버린 횟수 많은 순 */
  byIngredient: WasteRow[]
  /**
   * 기한이 지난 뒤에 버린 건들의 '며칠 늦었나'.
   * 기한 전에 버린 건은 여기 넣지 않는다 — 늦게 알아챈 게 아니라
   * 상했거나 안 먹을 것 같아서 버린 것이라 성격이 다르다.
   */
  lateDays: number[]
  /** 기한이 오기 전에 버린 건수 */
  discardedBeforeExpiry: number
  /** 기한을 안 적어둔 채 버린 건수 */
  discardedNoExpiry: number
  /** 카테고리별 버린 건수 */
  byCategory: { name: string; count: number }[]
  /** 가장 오래된 기록 날짜 — 이 통계가 며칠치인지 밝힌다 */
  since: string | null
}

async function fetchByStatus(status: 'consumed' | 'discarded'): Promise<StorageItem[]> {
  const { data, error } = await supabase
    .from('storage_items')
    .select('*, ingredients(name, category, is_seasoning)')
    .eq('status', status)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as StorageItem[]
}

/** 'YYYY-MM-DD' 두 개의 날짜 차이 (일). 로컬 자정 기준 */
function dayDiff(from: string, to: string): number {
  const d = (s: string) => {
    const [y, m, dd] = s.split('-').map(Number)
    return new Date(y, m - 1, dd).getTime()
  }
  return Math.round((d(to) - d(from)) / 86_400_000)
}

export async function fetchWasteStats(): Promise<{
  stats: WasteStats
  recent: StorageItem[]
}> {
  const [consumedItems, discardedItems] = await Promise.all([
    fetchByStatus('consumed'),
    fetchByStatus('discarded'),
  ])

  const total = consumedItems.length + discardedItems.length

  // 재료별 집계 — 먹은 횟수도 같이 센다. '자주 버린다'는 '자주 샀다'와 구분돼야 한다
  const rows = new Map<string, WasteRow>()
  const put = (items: StorageItem[], key: 'consumed' | 'discarded') => {
    for (const i of items) {
      const name = i.ingredients?.name ?? '(알 수 없음)'
      const r = rows.get(name) ?? {
        name,
        category: i.ingredients?.category ?? '기타',
        discarded: 0,
        consumed: 0,
      }
      r[key] += 1
      rows.set(name, r)
    }
  }
  put(consumedItems, 'consumed')
  put(discardedItems, 'discarded')

  const byIngredient = [...rows.values()]
    .filter((r) => r.discarded > 0)
    .sort((a, b) => b.discarded - a.discarded || b.consumed - a.consumed)

  // 기한 대비 언제 버렸나.
  //
  // 처음에는 부호를 안 보고 전부 평균에 넣었다가 "기한이 지나고 평균 -7일 뒤에
  // 처리했습니다"라는 문장이 화면에 떴다. 기한 7일 '전에' 버린 건이었다.
  // 두 경우는 뜻이 다르므로 섞지 않는다.
  //   지난 뒤 버림 → 늦게 알아챘다. 알림이 할 일이 있다
  //   오기 전 버림 → 상했거나 안 먹을 것 같았다. 알림과 무관하다
  const offsets = discardedItems
    .filter((i) => i.expires_on)
    .map((i) => dayDiff(i.expires_on!, i.updated_at.slice(0, 10)))
    .filter((v) => Number.isFinite(v))
  const lateDays = offsets.filter((v) => v > 0)
  const discardedBeforeExpiry = offsets.filter((v) => v <= 0).length
  const discardedNoExpiry = discardedItems.filter((i) => !i.expires_on).length

  const catMap = new Map<string, number>()
  for (const i of discardedItems) {
    const c = i.ingredients?.category ?? '기타'
    catMap.set(c, (catMap.get(c) ?? 0) + 1)
  }

  const all = [...consumedItems, ...discardedItems]
  const since = all.length
    ? all.map((i) => i.updated_at.slice(0, 10)).sort()[0]
    : null

  return {
    stats: {
      consumed: consumedItems.length,
      discarded: discardedItems.length,
      discardRate: total >= MIN_SAMPLE ? discardedItems.length / total : null,
      needMore: Math.max(0, MIN_SAMPLE - total),
      byIngredient,
      lateDays,
      discardedBeforeExpiry,
      discardedNoExpiry,
      byCategory: [...catMap.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      since,
    },
    recent: discardedItems.slice(0, 20),
  }
}
