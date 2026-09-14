/**
 * 유통기한 계산. 1.0에서 쓰던 공식을 그대로 가져왔다.
 *   urgency = 1 / (남은일수 + 1)
 * 설계서 4장 참고.
 */

/** 'YYYY-MM-DD'를 로컬 자정 기준 Date로. new Date(str)은 UTC로 해석돼 하루 밀린다. */
function parseDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 오늘 기준 남은 일수. 오늘이면 0, 지났으면 음수, 기한 없으면 null */
export function daysLeft(expiresOn: string | null): number | null {
  if (!expiresOn) return null
  const diff = parseDate(expiresOn).getTime() - parseDate(today()).getTime()
  return Math.round(diff / 86_400_000)
}

export function urgency(expiresOn: string | null): number {
  const d = daysLeft(expiresOn)
  if (d === null) return 0
  if (d < 0) return 1
  return 1 / (d + 1)
}

export function ddayLabel(expiresOn: string | null): string {
  const d = daysLeft(expiresOn)
  if (d === null) return '기한 미정'
  if (d < 0) return `${-d}일 지남`
  if (d === 0) return 'D-day'
  return `D-${d}`
}

/** 남은 일수에 따른 색. 급한 것이 눈에 먼저 들어와야 한다. */
export function ddayTone(expiresOn: string | null): string {
  const d = daysLeft(expiresOn)
  if (d === null) return 'bg-canvas text-muted'
  if (d < 0) return 'bg-danger/15 text-danger'
  if (d <= 1) return 'bg-danger/10 text-danger'
  if (d <= 3) return 'bg-clay/15 text-clay'
  return 'bg-sage/10 text-sage-dark'
}

/** 오늘부터 n일 뒤 날짜 문자열 */
export function plusDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
