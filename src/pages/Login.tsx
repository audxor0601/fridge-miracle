import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Mode = 'signin' | 'signup'

/**
 * 둘러보기 계정.
 *
 * 배포 링크로 들어온 사람에게 가입부터 시키면 대부분 여기서 나간다. 그런데
 * 빈 냉장고로는 추천도 지표도 보여줄 게 없다. 그래서 재료가 채워진 계정을
 * 하나 열어둔다 (scripts/seed_demo.py).
 *
 * 비밀번호가 번들에 실린다. 일부러 공개하는 값이라 괜찮다 — 이 계정으로
 * 볼 수 있는 건 이 계정의 행뿐이고, 그걸 막는 건 비밀번호가 아니라 RLS다.
 * 저장소에는 값을 두지 않고 배포 환경변수로만 넣는다. 둘 중 하나라도 없으면
 * 이 버튼은 아예 그려지지 않는다.
 */
const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL as string | undefined
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD as string | undefined

export default function Login() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleDemo() {
    if (!DEMO_EMAIL || !DEMO_PASSWORD) return
    setBusy(true)
    setError(null)
    setNotice(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    })
    if (error) setError(translate(error.message))
    setBusy(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) setError(translate(error.message))
      else if (!data.session)
        setNotice('가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인하세요.')
      // 세션이 바로 생기면 AuthProvider가 감지해 화면이 넘어간다
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(translate(error.message))
    }
    setBusy(false)
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-sage">냉장고의기적</h1>
          <p className="mt-2 text-sm text-muted">
            유통기한이 급한 재료부터 먹는 법
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-line bg-surface p-7 shadow-sm"
        >
          <div className="mb-5 flex gap-1 rounded-lg bg-canvas p-1">
            {(['signin', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); setNotice(null) }}
                className={`flex-1 rounded-md py-2 text-sm transition ${
                  mode === m
                    ? 'bg-surface font-bold text-sage shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {m === 'signin' ? '로그인' : '회원가입'}
              </button>
            ))}
          </div>

          <label className="mb-1 block text-xs font-medium text-muted">이메일</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="mb-4 w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-sage"
          />

          <label className="mb-1 block text-xs font-medium text-muted">비밀번호</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-sage"
          />
          <p className="mt-1.5 text-xs text-muted">6자 이상</p>

          {error && (
            <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          {notice && (
            <p className="mt-4 rounded-lg bg-sage/10 px-3 py-2 text-sm text-sage-dark">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 w-full rounded-lg bg-sage py-3 text-sm font-bold text-white transition hover:bg-sage-dark disabled:opacity-50"
          >
            {busy ? '처리 중...' : mode === 'signin' ? '로그인' : '가입하기'}
          </button>

          {DEMO_EMAIL && DEMO_PASSWORD && (
            <>
              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="text-xs text-muted">또는</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <button
                type="button"
                onClick={handleDemo}
                disabled={busy}
                className="w-full rounded-lg border border-sage px-4 py-3 text-sm font-bold text-sage transition hover:bg-sage/5 disabled:opacity-50"
              >
                가입 없이 둘러보기
              </button>
              <p className="mt-2 text-center text-xs leading-relaxed text-muted">
                재료가 채워진 데모 계정으로 들어갑니다.
                <br />
                누구나 쓰는 계정이라 남이 바꿔둔 상태가 보일 수 있습니다.
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  )
}

/** Supabase의 영문 오류를 사람이 읽을 수 있게 바꾼다 */
function translate(message: string): string {
  if (message.includes('Invalid login credentials'))
    return '이메일 또는 비밀번호가 맞지 않습니다.'
  if (message.includes('already registered')) return '이미 가입된 이메일입니다.'
  if (message.includes('Password should be')) return '비밀번호는 6자 이상이어야 합니다.'
  if (message.includes('Email not confirmed'))
    return '메일 인증이 아직 안 됐습니다. 받은 메일의 링크를 눌러주세요.'
  return message
}
