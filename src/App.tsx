import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Fridge from './pages/Fridge'
import Login from './pages/Login'

export default function App() {
  const { session, loading } = useAuth()

  // 세션 복원 전에 화면을 그리면 로그인 상태인데도 로그인 창이 깜빡인다
  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <p className="text-sm text-muted">불러오는 중...</p>
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate to="/fridge" replace /> : <Login />}
      />
      <Route
        path="/fridge"
        element={session ? <Fridge /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to={session ? '/fridge' : '/login'} replace />} />
    </Routes>
  )
}
