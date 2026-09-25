import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import metrics from '../data/metrics.json'
import { fetchLiveMetrics, type LiveMetrics } from '../lib/metrics'
import { recommend } from '../lib/recipes'

/**
 * 이 화면이 존재하는 이유.
 *
 * 1.0 화면에는 "Random Forest 정확도 88.4%", "XGBoost MAE 4.12"가 떠 있었다.
 * 그 숫자를 만든 코드는 Math.random()이었다. 모델도, 학습도, 평가도 없었다.
 *
 * 그래서 2.0은 지표를 화면에 띄우는 대신, 지표가 어디서 나왔는지를 같이 띄운다.
 * 아래 숫자는 전부 둘 중 하나다.
 *   · scripts/build_metrics.py 가 원본 파일을 직접 세어 커밋한 값
 *   · 이 페이지를 열 때 DB에 실제로 물어본 값
 * 손으로 적은 숫자는 없다.
 */

const n = (v: number) => v.toLocaleString('ko-KR')

function Stat({ label, value, unit, note }: {
  label: string; value: string; unit?: string; note?: string
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-bold">
        {value}
        {unit && <span className="ml-0.5 text-sm font-normal text-muted">{unit}</span>}
      </p>
      {note && <p className="mt-1 text-xs leading-relaxed text-muted">{note}</p>}
    </div>
  )
}

function Section({ title, source, children }: {
  title: string; source: string; children: ReactNode
}) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold">{title}</h2>
      <p className="mb-3 mt-0.5 font-mono text-xs text-muted">{source}</p>
      {children}
    </section>
  )
}

export default function About() {
  const [live, setLive] = useState<LiveMetrics | null>(null)
  const [recoMs, setRecoMs] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchLiveMetrics().then(setLive).catch((e) => setError(String(e)))
    // 추천 응답 시간은 '내 냉장고 기준'이어야 의미가 있다. 지금 재고로 실제로 한 번 돌린다
    recommend(40)
      .then(({ stats }) => setRecoMs(stats.elapsedMs))
      .catch(() => setRecoMs(null))
  }, [])

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <header className="mb-8 border-b border-line pb-5">
        <Link to="/fridge" className="text-sm text-muted transition hover:text-sage">
          ← 나의 냉장고
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-sage">이 숫자는 어디서 나왔나</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          1.0 화면에는 <b>Random Forest 88.4%</b>, <b>XGBoost MAE 4.12</b>가 떠 있었습니다.
          그 숫자를 만든 코드는 <code className="rounded bg-canvas px-1">Math.random()</code>이었습니다.
          모델도 학습도 평가도 없었습니다. 2.0은 그래서 지표 옆에 출처를 같이 답니다.
        </p>
        <p className="mt-2 text-xs text-muted">
          빌드 시점 측정 {metrics.measuredAt} · 커밋 {metrics.commit} · 그 외는 이 페이지를 열 때 DB 조회
        </p>
      </header>

      {error && (
        <p className="mb-5 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <Section title="1. 수집" source={`${metrics.collect.script} → 식약처 COOKRCP01 공개 API`}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="레시피" value={n(metrics.collect.recipes)} unit="건" />
          <Stat label="키 중복" value={n(metrics.collect.duplicateSeq)} unit="건" />
          <Stat label="평균 조리단계" value={String(metrics.collect.avgSteps)} unit="단계" />
          <Stat label="해시태그 결측" value={`${metrics.collect.hashtagMissingPct}`} unit="%" />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          해시태그가 69% 비어 있어서, 이 필드를 쓰려던 계획(태그 기반 추천)은 접었습니다.
          쓸 수 없는 컬럼을 미리 알아낸 것도 수집 단계의 결과입니다.
        </p>
      </Section>

      <Section title="2. 재료 파싱" source={metrics.parse.script}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="분해한 재료" value={n(metrics.parse.rows)} unit="줄" />
          <Stat label="수량까지 확보" value={`${metrics.parse.withQtyPct}`} unit="%" />
          <Stat label="고유 재료명" value={n(metrics.parse.uniqueNames)} unit="개" note="정제 전" />
          <Stat
            label="레시피당 필수재료"
            value={String(metrics.parse.essentialPerRecipe)}
            unit="개"
            note="추천 규칙을 두 번 갈아엎게 만든 숫자"
          />
        </div>
      </Section>

      <Section title="3. 파싱 검증" source={metrics.verify.script}>
        <p className="mb-3 text-sm leading-relaxed text-muted">
          두 가지를 따로 봅니다. 처음에는 ①만 만들었는데, 그것만으로는 부족하다는 걸
          ②가 없어서 못 봤습니다.
        </p>

        <p className="mb-2 text-sm font-bold">① 원문 대조</p>
        <p className="mb-2 text-xs leading-relaxed text-muted">{metrics.verify.how}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="검사한 항목" value={n(metrics.verify.checked)} unit="줄" />
          <Stat label="원문과 일치" value={n(metrics.verify.passed)} unit="줄" />
          <Stat label="통과율" value={`${metrics.verify.passRate}`} unit="%" />
        </div>

        <p className="mb-2 mt-5 text-sm font-bold">② 잔재 검사</p>
        <p className="mb-2 text-xs leading-relaxed text-muted">{metrics.residue.how}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="검사한 항목" value={n(metrics.residue.checked)} unit="줄" />
          <Stat label="깨끗한 이름" value={n(metrics.residue.passed)} unit="줄" />
          <Stat label="통과율" value={`${metrics.residue.passRate}`} unit="%" />
        </div>

        <div className="mt-3 rounded-xl border border-clay/30 bg-clay/5 p-4">
          <p className="text-sm font-bold text-clay">①만 있었을 때 놓친 것</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            ①의 통과율이 99.91%였습니다. 그런데 그 안에 <code>마늘 1</code>,{' '}
            <code>녹차(티백,</code> 같은 이름이 293개 섞여 있었습니다.{' '}
            <code>마늘 1</code>은 원문에 글자 그대로 있으니 ①을 통과합니다. 자를 자리를
            틀렸는지는 ①이 볼 수 없는 질문이었습니다.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            원인은 두 개였습니다. 수량 정규식이 괄호 <b>안</b>을 잡아서{' '}
            <code>녹차(티백, 1개)</code>의 <code>1개</code>를 수량으로 쓰고 이름을{' '}
            <code>녹차(티백,</code> 으로 잘랐고, 단위 없는 숫자(<code>배추김치 30</code>)는
            수량으로 인정하지 않아 숫자가 이름에 눌러앉았습니다. 뒤쪽 때문에 원문에 적혀
            있던 수량 195개를 그냥 버리고 있었습니다.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            괄호 안을 가린 사본에서 수량을 먼저 찾도록 바꾸고, 단위 없는 끝자리 숫자를
            수량으로 받도록 고쳤습니다. 깨진 이름 293개 → 1개, 수량 확보율 96.2% → 97.9%.
          </p>
          {metrics.residue.failSamples.length > 0 && (
            <>
              <p className="mt-3 text-xs font-bold text-muted">아직 남은 것</p>
              <ul className="mt-1 space-y-1">
                {metrics.residue.failSamples.map((f, i) => (
                  <li key={i} className="font-mono text-xs">
                    <span className="text-danger">{f.name}</span>
                    <span className="text-muted"> &larr; {f.raw}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                이 1줄은 파서 문제가 아닙니다. 식약처 원본이 <code>물(15m)</code>으로 적혀
                있습니다. 원본이 틀린 것까지 파서가 고치면 다른 곳이 망가집니다.
              </p>
            </>
          )}
        </div>
      </Section>

      <Section title="4. 지금 DB에 들어 있는 것" source="이 페이지를 열 때 Supabase에 직접 조회">
        {!live ? (
          <p className="text-sm text-muted">조회 중...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="recipes" value={n(live.recipes)} unit="행" />
              <Stat label="recipe_steps" value={n(live.steps)} unit="행" />
              <Stat label="ingredients" value={n(live.ingredients)} unit="행" />
              <Stat label="recipe_ingredients" value={n(live.recipeIngredients)} unit="행" />
            </div>
            <div className="mt-3 rounded-xl border border-line bg-surface p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-bold">재료 카테고리 분류</p>
                <p className="text-sm">
                  <b>{live.categorizedPct.toFixed(1)}%</b>
                  <span className="text-xs text-muted"> 가 기타가 아님</span>
                </p>
              </div>
              <ul className="mt-3 space-y-1.5">
                {live.categories.map((c) => (
                  <li key={c.name} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 text-muted">{c.name}</span>
                    <span
                      className="h-2 rounded-full bg-sage/40"
                      style={{ width: `${(c.count / live.categories[0].count) * 70}%` }}
                    />
                    <span className="text-muted">{n(c.count)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                이 분류가 대체 재료 매칭을 만듭니다. 레시피가 돼지고기를 요구할 때 냉장고의
                대패삼겹살로 대신 셀 수 있는 근거가 이 카테고리입니다. 포함 관계로 분류했더니
                감자가 과일(감)로, 김치가 해조(김)로 갔고, 접미사 일치로 바꿔서 고쳤습니다.
              </p>
            </div>
            <p className="mt-2 text-xs text-muted">위 조회에 걸린 시간 {live.elapsedMs}ms</p>
          </>
        )}
      </Section>

      <Section title="5. 추천 응답 시간" source="지금 내 냉장고 재고로 recommend()를 실제로 한 번 실행">
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="내 재고 기준 추천 계산"
            value={recoMs === null ? '측정 중' : String(recoMs)}
            unit={recoMs === null ? undefined : 'ms'}
            note="재고 조회 → 사전 로딩 → 후보 200개 중량 계산 → 이름 조회까지"
          />
        </div>
      </Section>

      <p className="border-t border-line pt-5 text-xs leading-relaxed text-muted">
        이 페이지의 숫자를 직접 다시 만들려면{' '}
        <code className="rounded bg-canvas px-1">python3 scripts/build_metrics.py</code> 를 실행하면
        됩니다. 결과가 <code className="rounded bg-canvas px-1">src/data/metrics.json</code> 에
        덮어써지고, 이 화면은 그 파일을 그대로 읽습니다.
      </p>
    </div>
  )
}
