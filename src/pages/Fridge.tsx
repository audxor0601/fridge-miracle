import { useAuth } from '../lib/auth'

export default function Fridge() {
  const { user, signOut } = useAuth()

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-10 flex items-center justify-between border-b border-line pb-5">
        <div>
          <h1 className="text-2xl font-bold text-sage">나의 냉장고</h1>
          <p className="mt-1 text-sm text-muted">{user?.email}</p>
        </div>
        <button
          onClick={signOut}
          className="rounded-lg border border-line px-4 py-2 text-sm text-muted transition hover:border-sage hover:text-sage"
        >
          로그아웃
        </button>
      </header>

      <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-12 text-center">
        <p className="text-sm text-muted">
          재고 등록은 Step 5에서 붙입니다.
        </p>
        <p className="mt-2 text-xs text-muted">
          레시피 1,156건 · 재료 사전 1,936개는 이미 DB에 있습니다.
        </p>
      </div>
    </div>
  )
}
