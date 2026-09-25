import { useEffect, useState } from 'react'
import { fetchProfile, updateProfile, type Profile } from '../lib/profile'

/**
 * 유통기한 알림 설정.
 *
 * 메일 본문이 "발송 시각은 앱에서 바꿀 수 있습니다"라고 말하므로 그 화면이
 * 실제로 있어야 한다. 없으면 메일이 거짓말을 하는 것이다.
 *
 * 수신자 제약도 여기 적는다. Resend는 도메인 인증 전까지 계정 소유자 주소로만
 * 보낸다. 토글만 놓고 이 사실을 숨기면 켜놓고 안 오는 사람이 생긴다.
 */
export default function NotifySettings() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProfile()
      .then(setProfile)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  async function save(patch: Partial<Pick<Profile, 'notify_email' | 'notify_hour'>>) {
    if (!profile) return
    const next = { ...profile, ...patch }
    setProfile(next)          // 먼저 반영하고
    setBusy(true)
    try {
      await updateProfile(profile.id, patch)
      setError(null)
    } catch (e) {
      setProfile(profile)     // 실패하면 되돌린다
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!profile) return null

  return (
    <section className="mt-8 rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-bold">유통기한 알림</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            3일 안에 써야 하는 재료가 있는 날에만 메일을 보냅니다.
            없는 날은 보내지 않습니다.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={profile.notify_email}
          disabled={busy}
          onClick={() => save({ notify_email: !profile.notify_email })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
            profile.notify_email ? 'bg-sage' : 'bg-line'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              profile.notify_email ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      {profile.notify_email && (
        <label className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-muted">받을 시각</span>
          <select
            value={profile.notify_hour}
            disabled={busy}
            onChange={(e) => save({ notify_hour: Number(e.target.value) })}
            className="rounded-lg border border-line px-2 py-1.5 text-sm outline-none focus:border-sage disabled:opacity-50"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
          <span className="text-xs text-muted">한국 시간</span>
        </label>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
      )}

      <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">
        <b>지금은 개발자 계정 주소로만 메일이 도착합니다.</b> 메일 발송에 쓰는
        Resend가 도메인 인증 전까지 계정 소유자 본인 주소 외에는 발송을 막기
        때문입니다. 설정은 저장되고 발송 파이프라인도 실제로 돌지만, 수신자
        범위가 막혀 있는 상태입니다. 도메인을 붙이면 풀립니다.
      </p>
    </section>
  )
}
