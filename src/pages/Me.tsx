import { Link } from 'react-router-dom'
import NotifySettings from '../components/NotifySettings'
import { useAuth } from '../lib/auth'

/** 탭 바의 '내 정보'. 냉장고 화면 머리에 있던 알림 설정·지표·로그아웃을 여기로 모았다. */
export default function Me() {
  const { user, signOut } = useAuth()

  return (
    <div className="mx-auto max-w-2xl px-5 pt-12">
      <h1 className="text-2xl">내 정보</h1>

      <div className="mt-5 rounded-3xl bg-surface p-5">
        <p className="text-sm text-muted">로그인한 계정</p>
        <p className="mt-1 font-bold">{user?.email}</p>
      </div>

      <NotifySettings />

      <div className="mt-4 overflow-hidden rounded-3xl bg-surface">
        <Link to="/about" className="flex h-14 items-center justify-between border-b border-line px-5">
          이 서비스의 숫자는 어디서 왔나
          <span aria-hidden className="text-muted">›</span>
        </Link>
        <button onClick={signOut} className="flex h-14 w-full items-center px-5 text-left">
          로그아웃
        </button>
      </div>

      <p className="mt-5 text-center text-xs text-muted">
        레시피 출처 · 식품의약품안전처 조리식품 레시피 DB
      </p>
    </div>
  )
}
