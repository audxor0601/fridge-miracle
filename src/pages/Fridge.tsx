import { useCallback, useEffect, useState } from 'react'
import AddItemForm from '../components/AddItemForm'
import ExpiredBanner from '../components/ExpiredBanner'
import ItemList from '../components/ItemList'
import { useAuth } from '../lib/auth'
import { listItems, removeItem, setStatus } from '../lib/storage'
import type { StorageItem } from '../lib/types'

export default function Fridge() {
  const { user } = useAuth()
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
    <div className="mx-auto max-w-2xl px-5 pt-12 pb-6">
      <header className="mb-6">
        <h1 className="text-2xl">나의 냉장고</h1>
      </header>

      {error && (
        <p className="mb-5 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <ExpiredBanner items={items} onDiscard={(id) => act(() => setStatus(id, 'discarded'))} />

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
