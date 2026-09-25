/**
 * 유통기한 다이제스트 — 설계서 5장
 *
 * Supabase Cron이 매시 정각에 부른다. 부르는 쪽은 x-digest-secret 헤더를
 * 같이 보내야 한다.
 *
 * 하는 일
 *   ① 지금이 KST 몇 시인지 계산한다
 *   ② notify_email = true 이고 notify_hour 가 그 시각인 프로필을 찾는다
 *   ③ 오늘 이미 보낸 사람을 뺀다 (notification_log)
 *   ④ 남은 사람의 급한 재료를 모은다. 0건이면 메일을 만들지 않는다
 *   ⑤ Resend로 보내고 notification_log에 기록한다
 *
 * ?dry=1 을 붙이면 발송 없이 "누구에게 무엇을 보낼 것인가"만 돌려준다.
 * 이 프로젝트의 다른 스크립트와 같은 규칙이다. 먼저 보고, 확인하고, 실행한다.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const DIGEST_SECRET = Deno.env.get('DIGEST_SECRET')!
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? 'onboarding@resend.dev'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://fridge-miracle.vercel.app'

/** 며칠 앞까지를 '급하다'로 볼 것인가 */
const SOON_DAYS = 3

type Item = { name: string; expires_on: string; qty: number | null; unit: string | null }

const H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...H, ...(init?.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : []
}

/** UTC 기준 now를 KST로 옮긴 Date. getUTC* 로 읽으면 KST 값이 나온다. */
function kstNow(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysLeft(expiresOn: string, todayKst: string): number {
  return Math.round((Date.parse(expiresOn) - Date.parse(todayKst)) / 86_400_000)
}

function label(d: number): string {
  if (d < 0) return `${-d}일 지남`
  if (d === 0) return '오늘까지'
  return `${d}일 남음`
}

function buildEmail(items: Item[], todayKst: string) {
  const sorted = [...items].sort((a, b) => a.expires_on.localeCompare(b.expires_on))
  const expired = sorted.filter((i) => daysLeft(i.expires_on, todayKst) < 0)
  const soon = sorted.filter((i) => daysLeft(i.expires_on, todayKst) >= 0)

  const head = soon[0] ?? expired[0]
  const rest = items.length - 1
  const subject =
    rest > 0
      ? `${head.name} ${label(daysLeft(head.expires_on, todayKst))} 외 ${rest}개`
      : `${head.name} ${label(daysLeft(head.expires_on, todayKst))}`

  const row = (i: Item) => {
    const d = daysLeft(i.expires_on, todayKst)
    const color = d < 0 ? '#b4544a' : d <= 1 ? '#b4544a' : '#9a7b5c'
    const amount = i.qty ? ` ${i.qty}${i.unit ?? ''}` : ''
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee5dc;">
        <b>${i.name}</b><span style="color:#8b8378;">${amount}</span>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #eee5dc;text-align:right;color:${color};">
        ${label(d)}
      </td>
    </tr>`
  }

  const section = (title: string, list: Item[]) =>
    list.length === 0
      ? ''
      : `<p style="margin:20px 0 4px;font-size:13px;color:#8b8378;">${title}</p>
         <table style="width:100%;border-collapse:collapse;font-size:15px;">${list.map(row).join('')}</table>`

  const html = `<div style="max-width:480px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;color:#3d3a34;">
  <p style="margin:0 0 4px;font-size:13px;color:#8b8378;">냉장고의기적</p>
  <h1 style="margin:0 0 16px;font-size:20px;color:#6b7a5e;">${subject}</h1>
  ${section('기한이 지났습니다', expired)}
  ${section(`${SOON_DAYS}일 안에 써야 합니다`, soon)}
  <p style="margin:28px 0 0;">
    <a href="${APP_URL}/recipes" style="display:inline-block;background:#6b7a5e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:bold;">
      이 재료로 만들 수 있는 요리 보기
    </a>
  </p>
  <p style="margin:20px 0 0;font-size:12px;line-height:1.7;color:#8b8378;">
    기한이 지난 재료는 추천 계산에서 빼고 있습니다. 먹으라고 권하지 않습니다.<br>
    발송 시각은 앱에서 바꿀 수 있습니다.
  </p>
</div>`

  return { subject: `[냉장고의기적] ${subject}`, html }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-digest-secret') !== DIGEST_SECRET) {
    return new Response('unauthorized', { status: 401 })
  }

  const dry = new URL(req.url).searchParams.get('dry') === '1'
  const now = kstNow()
  const hour = now.getUTCHours()          // KST로 옮겨둔 값이라 이게 KST 시각이다
  const todayKst = ymd(now)
  const limit = ymd(new Date(now.getTime() + SOON_DAYS * 86_400_000))

  const profiles = await rest(
    `profiles?select=id,nickname,notify_hour&notify_email=eq.true&notify_hour=eq.${hour}`,
  )
  if (profiles.length === 0) {
    return Response.json({ hour, todayKst, targets: 0, sent: 0, note: '이 시각에 받을 사람이 없습니다' })
  }

  const ids = profiles.map((p: { id: string }) => p.id)
  const already = await rest(
    `notification_log?select=user_id&kind=eq.expiry_digest&sent_on=eq.${todayKst}` +
      `&user_id=in.(${ids.join(',')})`,
  )
  const sentIds = new Set(already.map((r: { user_id: string }) => r.user_id))

  const report: unknown[] = []
  let sent = 0

  for (const p of profiles) {
    if (sentIds.has(p.id)) {
      report.push({ user: p.id, skipped: '오늘 이미 발송' })
      continue
    }

    const rows = await rest(
      `storage_items?select=qty,unit,expires_on,ingredients(name)` +
        `&user_id=eq.${p.id}&status=eq.active&expires_on=not.is.null&expires_on=lte.${limit}` +
        `&order=expires_on.asc`,
    )
    const items: Item[] = rows.map(
      (r: { qty: number | null; unit: string | null; expires_on: string; ingredients: { name: string } | null }) => ({
        name: r.ingredients?.name ?? '(이름 없음)',
        expires_on: r.expires_on,
        qty: r.qty,
        unit: r.unit,
      }),
    )

    // 급한 게 없으면 보내지 않는다. 설계서 5.2
    if (items.length === 0) {
      report.push({ user: p.id, skipped: '급한 재료 없음' })
      continue
    }

    const { subject, html } = buildEmail(items, todayKst)

    if (dry) {
      report.push({ user: p.id, would_send: subject, items: items.length })
      continue
    }

    // 수신자는 auth.users에만 있다. admin API로 읽는다
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${p.id}`, { headers: H })
    const email = (await userRes.json())?.email
    if (!email) {
      report.push({ user: p.id, error: '이메일 주소를 찾을 수 없음' })
      continue
    }

    const mail = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: MAIL_FROM, to: [email], subject, html }),
    })

    if (!mail.ok) {
      // 도메인 인증 전이면 본인 주소 외에는 403이 온다 (설계서 5.4).
      // 실패를 삼키지 않고 그대로 올린다. 기록도 남기지 않는다.
      report.push({ user: p.id, error: `resend ${mail.status}: ${(await mail.text()).slice(0, 200)}` })
      continue
    }

    await rest('notification_log', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: p.id,
        kind: 'expiry_digest',
        sent_on: todayKst,
        payload: { count: items.length, subject },
      }),
    })
    sent += 1
    report.push({ user: p.id, sent: subject, items: items.length })
  }

  return Response.json({ hour, todayKst, dry, targets: profiles.length, sent, report })
})
