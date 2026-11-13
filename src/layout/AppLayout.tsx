import { NavLink, Outlet } from 'react-router-dom'

/**
 * 로그인한 뒤의 모든 화면을 감싸는 틀.
 * 화면 내용은 <Outlet /> 자리에 들어가고, 아래에 탭 바가 고정된다.
 */

const TABS = [
  {
    to: '/fridge',
    label: '냉장고',
    icon: (
      <>
        <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
        <path d="M5 10h14M8.5 6v1.5M8.5 13v2.5" />
      </>
    ),
  },
  {
    to: '/recipes',
    label: '추천',
    icon: (
      <>
        <path d="M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z" />
        <path d="M2 11h20M9 7c0-1.5 1-2 1-3.5M14 7c0-1.5 1-2 1-3.5" />
      </>
    ),
  },
  {
    to: '/waste',
    label: '버린 기록',
    icon: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  },
  {
    to: '/me',
    label: '내 정보',
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
      </>
    ),
  },
]

export default function AppLayout() {
  return (
    <div className="min-h-full pb-[calc(72px+env(safe-area-inset-bottom))]">
      <Outlet />

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid h-[64px] max-w-2xl grid-cols-4">
          {TABS.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                className={({ isActive }) =>
                  `flex h-full flex-col items-center justify-center gap-0.5 text-[11px] ${
                    isActive ? 'font-bold text-ink' : 'text-muted'
                  }`
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  {t.icon}
                </svg>
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
