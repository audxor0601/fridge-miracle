import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './layout/AppLayout'
import { useAuth } from './lib/auth'
import About from './pages/About'
import Fridge from './pages/Fridge'
import Login from './pages/Login'
import Me from './pages/Me'
import RecipeDetail from './pages/RecipeDetail'
import Recipes from './pages/Recipes'
import Waste from './pages/Waste'

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

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/fridge" element={<Fridge />} />
        <Route path="/recipes" element={<Recipes />} />
        <Route path="/recipes/:id" element={<RecipeDetail />} />
        <Route path="/waste" element={<Waste />} />
        <Route path="/me" element={<Me />} />
        <Route path="/about" element={<About />} />
      </Route>
      <Route path="*" element={<Navigate to="/fridge" replace />} />
    </Routes>
  )
}
