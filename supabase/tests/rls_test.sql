-- 테스트 사용자 2명
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.com');
insert into public.ingredients (name, aliases, category, default_shelf_life_days) values
  ('삼겹살', '{"돼지고기"}', '육류', 3), ('대파', '{"파"}', '채소', 7);

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;

\echo '### [1] 회원가입 트리거 (기대: a, b 프로필 자동 생성)'
select nickname, household_size, notify_hour from public.profiles order by nickname;

\echo '### [2] A로 로그인해 재고 2건 등록'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  insert into public.storage_items (user_id, ingredient_id, qty, unit, expires_on) values
    ('11111111-1111-1111-1111-111111111111', 1, 300, 'g', current_date + 1),
    ('11111111-1111-1111-1111-111111111111', 2, 1, '개', current_date);
  select count(*) as "A가 보는 재고" from public.storage_items;
commit;

\echo '### [3] A가 B의 이름으로 등록 시도 (기대: RLS 차단)'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  insert into public.storage_items (user_id, ingredient_id, qty, unit)
    values ('22222222-2222-2222-2222-222222222222', 1, 100, 'g');
commit;

\echo '### [4] B로 로그인 (기대: 재고 0, 프로필 1=본인것만, 재료 2)'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  select
    (select count(*) from public.storage_items) as "B가 보는 재고",
    (select count(*) from public.profiles)      as "B가 보는 프로필",
    (select count(*) from public.ingredients)   as "B가 보는 재료사전";
commit;

\echo '### [5] B가 A의 재고를 지우려 시도 (기대: 0건 삭제)'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  with d as (delete from public.storage_items returning 1) select count(*) as "삭제된 행" from d;
commit;

\echo '### [6] 비로그인 (기대: 레시피 조회 가능, 재고 0건)'
begin;
  set local role anon;
  select (select count(*) from public.recipes) as "레시피", (select count(*) from public.storage_items) as "재고";
commit;

\echo '### [7] 알림이력에 사용자가 직접 기록 시도 (기대: 차단 — Edge Function만 가능)'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  insert into public.notification_log (user_id, kind) values ('11111111-1111-1111-1111-111111111111', 'expiry_digest');
commit;

\echo '### [8] 최종 확인 — 실제 저장된 재고 (superuser, 기대: A 2건뿐)'
select user_id, ingredient_id, qty, unit, expires_on from public.storage_items order by id;
