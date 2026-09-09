import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    '.env.local 에 VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 를 설정하세요.',
  )
}

/**
 * anon 키는 브라우저에 그대로 노출된다. 그래도 안전한 이유는
 * 데이터를 지키는 것이 키가 아니라 DB의 RLS 정책이기 때문이다.
 * (supabase/migrations/0001_init.sql 7장 참고)
 */
export const supabase = createClient(url, anonKey)
