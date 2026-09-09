# Supabase

## 구조
- `migrations/0001_init.sql` — 초기 스키마 (테이블 7개 + RLS 정책 11개)
- `tests/00_supabase_stub.sql` — 로컬 Postgres에서 `auth` 스키마를 흉내내는 스텁
- `tests/rls_test.sql` — RLS 격리 검증 (사용자 A/B 두 명으로 8가지 시나리오)

## 적용
Supabase 대시보드 > SQL Editor 에 `migrations/0001_init.sql` 을 붙여넣고 실행.

## 로컬 검증 (선택)
Supabase에 올리기 전, 로컬 Postgres 16에서 문법과 RLS 동작을 확인할 수 있다.

```bash
psql -U postgres -f supabase/tests/00_supabase_stub.sql
psql -U postgres -f supabase/migrations/0001_init.sql
psql -U postgres -f supabase/tests/rls_test.sql
```

검증 항목과 기대 결과:

| # | 시나리오 | 기대 |
|---|---|---|
| 1 | 회원가입 트리거 | profiles 자동 생성 |
| 2 | A가 본인 재고 등록·조회 | 2건 |
| 3 | A가 B의 user_id로 등록 | RLS 차단 |
| 4 | B가 조회 | 재고 0 / 프로필 1(본인) / 재료사전 2 |
| 5 | B가 A의 재고 삭제 시도 | 0건 삭제 |
| 6 | 비로그인 조회 | 레시피 가능, 재고 0 |
| 7 | 사용자가 알림이력 직접 기록 | 차단 (service_role 전용) |
| 8 | 최종 데이터 확인 | A의 2건만 존재 |
