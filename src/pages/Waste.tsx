import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MIN_AVG_SAMPLE, MIN_SAMPLE, fetchWasteStats, type WasteStats } from '../lib/waste'
import type { StorageItem } from '../lib/types'

/**
 * 버림 기록.
 *
 * 냉장고 화면에서 '먹음'과 '버림'을 누른 기록이 여기 쌓인다. 유통기한 알림이
 * 실제로 일을 하고 있는지 확인할 수 있는 유일한 자리다.
 *
 * 표본이 MIN_SAMPLE보다 적으면 비율을 내지 않는다. 대신 몇 건이 더 필요한지
 * 화면에 적는다. 기록 3건으로 버림률을 띄우는 건 1.0이 하던 짓이다.
 */

const n = (v: number) => v.toLocaleString('ko-KR')

function Stat({ label, value, unit, tone }: {
  label: string; value: string; unit?: string; tone?: 'danger' | 'sage'
}) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'sage' ? 'text-sage-dark' : ''
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${color}`}>
        {value}
        {unit && <span className="ml-0.5 text-sm font-normal text-muted">{unit}</span>}
      </p>
    </div>
  )
}

export default function Waste() {
  const [stats, setStats] = useState<WasteStats | null>(null)
  const [recent, setRecent] = useState<StorageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchWasteStats()
      .then(({ stats, recent }) => {
        setStats(stats)
        setRecent(recent)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  // 평균은 MIN_AVG_SAMPLE건 이상일 때만. 1건으로 '평균'이라고 쓰면 비율에 걸어둔
  // 10건 규칙과 앞뒤가 안 맞는다
  const lateAvg =
    stats && stats.lateDays.length >= MIN_AVG_SAMPLE
      ? stats.lateDays.reduce((a, b) => a + b, 0) / stats.lateDays.length
      : null

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <header className="mb-8 border-b border-line pb-5">
        <Link to="/fridge" className="text-sm text-muted transition hover:text-sage">
          ← 나의 냉장고
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-sage">무엇을 버렸나</h1>
        <p className="mt-1 text-sm text-muted">
          냉장고에서 누른 먹음·버림 기록입니다
          {stats?.since && ` · ${stats.since}부터`}
        </p>
      </header>

      {error && (
        <p className="mb-5 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-muted">기록을 세는 중...</p>
      ) : !stats || stats.consumed + stats.discarded === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-12 text-center">
          <p className="text-sm leading-relaxed text-muted">
            아직 기록이 없습니다.
            <br />
            냉장고에서 재료를 <b>먹음</b> 또는 <b>버림</b>으로 처리하면 여기 쌓입니다.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-3 gap-2">
            <Stat label="먹음" value={n(stats.consumed)} unit="건" tone="sage" />
            <Stat label="버림" value={n(stats.discarded)} unit="건" tone="danger" />
            <Stat
              label="버림 비율"
              value={stats.discardRate === null ? '—' : `${Math.round(stats.discardRate * 100)}`}
              unit={stats.discardRate === null ? undefined : '%'}
            />
          </div>

          {stats.discardRate === null && (
            <div className="mb-6 rounded-2xl border border-line bg-canvas px-4 py-3">
              <p className="text-sm leading-relaxed">
                <b>비율은 아직 내지 않습니다.</b> 지금 기록이{' '}
                {n(stats.consumed + stats.discarded)}건인데, {MIN_SAMPLE}건은 모여야 비율이
                뭔가를 말해줍니다. <b>{stats.needMore}건</b> 더 필요합니다.
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                3건 중 1건을 버렸다고 "버림률 33%"를 띄울 수도 있습니다. 그럴듯해 보이지만
                다음 한 건에 25%가 되거나 50%가 됩니다. 그건 지표가 아닙니다.
              </p>
            </div>
          )}

          {stats.discarded > 0 && (
            <div className="mb-6 rounded-2xl border border-clay/30 bg-clay/5 px-4 py-3">
              <p className="text-sm font-bold text-clay">기한 대비 언제 버렸나</p>
              <ul className="mt-2 space-y-1 text-sm">
                <li>
                  기한이 지난 뒤에 버림 <b>{stats.lateDays.length}건</b>
                  {lateAvg !== null && (
                    <span className="ml-1">
                      · 평균 <b className="text-clay">{lateAvg.toFixed(1)}일</b> 늦게
                    </span>
                  )}
                  {stats.lateDays.length > 0 && lateAvg === null && (
                    <span className="ml-1 text-xs text-muted">
                      (평균은 {MIN_AVG_SAMPLE}건부터 냅니다)
                    </span>
                  )}
                </li>
                <li>
                  기한이 오기 전에 버림 <b>{stats.discardedBeforeExpiry}건</b>
                </li>
                {stats.discardedNoExpiry > 0 && (
                  <li className="text-muted">
                    기한을 안 적어둔 채 버림 <b>{stats.discardedNoExpiry}건</b>
                  </li>
                )}
              </ul>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                두 줄을 나눈 이유가 있습니다. 기한이 <b>지난 뒤</b> 버린 건 늦게 알아챈
                것이라 알림이 할 일이 있습니다. 기한이 <b>오기 전에</b> 버린 건 상했거나
                안 먹을 것 같아서 버린 것이라 알림과 무관합니다. 한 평균에 섞으면 둘 다
                안 보입니다.
              </p>
            </div>
          )}

          {stats.byIngredient.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-1 text-base font-bold">자주 버리는 재료</h2>
              <p className="mb-3 text-xs leading-relaxed text-muted">
                먹은 횟수도 같이 적습니다. 많이 버린 것과 많이 산 것은 다릅니다 —
                10번 사서 2번 버린 재료보다 2번 사서 2번 버린 재료가 문제입니다.
              </p>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {stats.byIngredient.map((r) => (
                  <li key={r.name} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <b className="text-sm">{r.name}</b>
                      <span className="ml-2 text-xs text-muted">{r.category}</span>
                    </span>
                    <span className="shrink-0 text-sm">
                      <span className="text-danger">버림 {r.discarded}</span>
                      <span className="ml-2 text-xs text-muted">
                        먹음 {r.consumed}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {stats.byCategory.length > 1 && (
            <section className="mb-8">
              <h2 className="mb-3 text-base font-bold">어떤 종류를 버리나</h2>
              <ul className="space-y-1.5">
                {stats.byCategory.map((c) => (
                  <li key={c.name} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 text-muted">{c.name}</span>
                    <span
                      className="h-2 rounded-full bg-danger/40"
                      style={{ width: `${(c.count / stats.byCategory[0].count) * 70}%` }}
                    />
                    <span className="text-muted">{c.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {recent.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-bold">최근 버린 것</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {recent.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <b>{i.ingredients?.name}</b>
                      {i.qty && (
                        <span className="ml-1 text-xs text-muted">
                          {i.qty}
                          {i.unit}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {i.updated_at.slice(0, 10)} 버림
                      {i.expires_on && ` · 기한 ${i.expires_on}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
