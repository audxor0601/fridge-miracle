/**
 * 재료 카테고리별 아이콘.
 * 재료마다 그림을 만들면 1,695개가 필요하다. DB에 이미 있는 13개 카테고리로 묶어 그린다.
 */

type Art = { bg: string; svg: React.ReactNode }

const MEAT: Art = {
  bg: '#fdeef0',
  svg: (
    <>
      <rect x="4" y="9" width="24" height="14" rx="4" fill="#f4a3ad" />
      <path d="M6 13c6 1 14-1 20 0M6 18c6 1 14-1 20 0" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
}

const ART: Record<string, Art> = {
  돼지고기: MEAT,
  소고기: { ...MEAT, svg: <><rect x="4" y="9" width="24" height="14" rx="4" fill="#c7505d" /><path d="M8 14c5 2 11-2 16 0" stroke="#f3c3c8" strokeWidth="2" fill="none" strokeLinecap="round" /></> },
  닭고기: { bg: '#fdf3e6', svg: <><path d="M10 22c-4-4-2-13 6-14 7-1 11 5 9 10-1 4-5 6-9 6z" fill="#f2c27b" /><path d="M10 22l-4 5" stroke="#e8d9c4" strokeWidth="3" strokeLinecap="round" /></> },
  해물류: { bg: '#eaf3fb', svg: <><path d="M4 16c4-6 13-8 19-2l5-4v12l-5-4c-6 6-15 4-19-2z" fill="#6aa6dc" /><circle cx="11" cy="15" r="1.4" fill="#fff" /></> },
  '건어물·해조': { bg: '#e9f2ec', svg: <path d="M6 24c4-6 0-10 4-16M13 24c4-6 0-10 4-16M20 24c4-6 0-10 4-16" stroke="#2e7d4f" strokeWidth="3" fill="none" strokeLinecap="round" /> },
  '달걀·유제품': { bg: '#fdf6e3', svg: <><ellipse cx="16" cy="17" rx="8.5" ry="10.5" fill="#f5deb3" /><ellipse cx="13" cy="13" rx="2.2" ry="3" fill="#fbecd0" /></> },
  '두부·콩': { bg: '#eef4fb', svg: <><path d="M5 13l11-5 11 5v9l-11 5-11-5z" fill="#fff" stroke="#c9d6e3" strokeWidth="1.2" /><path d="M5 13l11 5 11-5M16 18v9" fill="none" stroke="#c9d6e3" strokeWidth="1.2" /></> },
  버섯류: { bg: '#f6efe6', svg: <><path d="M5 15a11 9 0 0 1 22 0z" fill="#b07a4f" /><rect x="13" y="15" width="6" height="11" rx="3" fill="#efe3d3" /></> },
  '곡류·면': { bg: '#f3f7ef', svg: <><path d="M5 16h22a11 11 0 0 1-22 0z" fill="#fff" stroke="#b9c4ad" strokeWidth="1.4" /><path d="M7 16c2-6 16-6 18 0z" fill="#fbfbf6" stroke="#e0dccf" /></> },
  과일류: { bg: '#fdeeee', svg: <><circle cx="16" cy="18" r="9" fill="#e5534b" /><path d="M16 9c0-3 2-5 4-5" stroke="#6d4c2f" strokeWidth="2" fill="none" strokeLinecap="round" /></> },
  '양념·조미': { bg: '#f4f1ec', svg: <><rect x="11" y="10" width="10" height="17" rx="3" fill="#8d6e4a" /><rect x="13" y="5" width="6" height="6" rx="1.5" fill="#d9c7ad" /></> },
  채소류: { bg: '#edf6e9', svg: <><path d="M7 25c-3-3 2-10 8-15s11-6 12-4-3 8-9 13-9 8-11 6z" fill="#7cb342" /><path d="M11 20c3-3 7-7 11-9" stroke="#b5d98a" strokeWidth="1.6" fill="none" strokeLinecap="round" /></> },
}

const FALLBACK: Art = { bg: '#f2f4f6', svg: <circle cx="16" cy="16" r="7" fill="#b0b8c1" /> }

export default function IngredientIcon({ category, size = 44 }: { category?: string | null; size?: number }) {
  const art = (category && ART[category]) || FALLBACK
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[14px]"
      style={{ width: size, height: size, background: art.bg }}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" width={size * 0.68} height={size * 0.68}>
        {art.svg}
      </svg>
    </span>
  )
}
