import { supabase } from './supabase'

/**
 * 알림 설정. profiles 테이블의 notify_email / notify_hour 를 읽고 쓴다.
 *
 * RLS가 본인 행만 허용하므로 where 조건을 따로 걸지 않는다.
 * 회원가입 시 handle_new_user 트리거가 행을 미리 만들어둔다.
 */

export type Profile = {
  id: string
  nickname: string | null
  notify_email: boolean
  /** 받고 싶은 시각 (KST 0~23) */
  notify_hour: number
}

export async function fetchProfile(): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, notify_email, notify_hour')
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * PostgREST는 update에 필터를 요구한다. RLS가 어차피 본인 행만 허용하지만,
 * 필터를 붙이지 않으면 전체 갱신으로 보고 막는다. 그래서 id를 명시한다.
 * uuid 컬럼이라 빈 문자열 비교 같은 우회는 쓰지 않는다.
 */
export async function updateProfile(
  id: string,
  patch: Partial<Pick<Profile, 'notify_email' | 'notify_hour'>>,
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', id)
  if (error) throw error
}
