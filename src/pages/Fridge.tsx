import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AddItemForm from '../components/AddItemForm'
import ItemList from '../components/ItemList'
import { useAuth } from '../lib/auth'
import { listItems, removeItem, setStatus } from '../lib/storage'
import type { StorageItem } from '../lib/types'

export default function Fridge() {
  const { user, signOut } = useAuth()
  const [items, setItems] = useState<StorageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await listItems('active'))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function act(fn: () => Promise<void>) {
    try {
      await fn()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <header className="mb-8 flex items-center justify-between border-b border-line pb-5">
        <div>
          <h1 className="text-2xl font-bold text-sage">나의 냉장고</h1>
          <p className="mt-1 text-sm text-muted">{user?.email}</p>
        </div>
        <div className="flex items-center gap-2">
        <Link
          to="/recipes"
          className="rounded-lg bg-sage px-4 py-2 text-sm font-bold text-white transition hover:bg-sage-dark"
        >
          오늘 뭐 먹지
        </Link>
        <button
          onClick={signOut}
          className="rounded-lg border border-line px-4 py-2 text-sm text-muted transition hover:border-sage hover:text-sage"
        >
          로그아웃
        </button>
        </div>
      </header>

      {error && (
        <p className="mb-5 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <div className="mb-8">
        <AddItemForm userId={user!.id} onAdded={load} />
      </div>

      {loading ? (
        <p className="text-sm text-muted">불러오는 중...</p>
      ) : (
        <ItemList
          items={items}
          onConsume={(id) => act(() => setStatus(id, 'consumed'))}
          onDiscard={(id) => act(() => setStatus(id, 'discarded'))}
          onDelete={(id) => act(() => removeItem(id))}
        />
      )}
    </div>
  )
}
