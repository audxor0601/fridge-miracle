-- ============================================================
-- 냉장고의기적 2.0 — 초기 스키마
-- 0001_init.sql
--
-- 적용: Supabase 대시보드 > SQL Editor 에 붙여넣고 실행
-- 설계 근거: docs/설계서_v0.1.md 3장
-- ============================================================

-- ------------------------------------------------------------
-- 1. profiles — 사용자 설정
--    auth.users 는 Supabase가 관리한다. 서비스 고유 설정만 여기 둔다.
-- ------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  nickname       text,
  household_size smallint    not null default 1  check (household_size between 1 and 10),
  notify_email   boolean     not null default true,
  notify_hour    smallint    not null default 8  check (notify_hour between 0 and 23), -- KST 기준
  created_at     timestamptz not null default now()
);

comment on column public.profiles.notify_hour is '다이제스트 발송 희망 시각 (KST 0~23)';

-- 회원가입 시 프로필 자동 생성
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 2. ingredients — 재료 마스터 사전
--    재고와 레시피가 만나는 지점. 문자열 비교 대신 이 테이블의 id로 조인한다.
-- ------------------------------------------------------------
create table public.ingredients (
  id                      bigint generated always as identity primary key,
  name                    text not null unique,              -- 표준명 ("대파")
  aliases                 text[] not null default '{}',      -- {"파","쪽파","실파"}
  category                text not null default '기타',       -- 육류/채소/유제품/양념/곡물/기타
  default_shelf_life_days smallint,                          -- 유통기한 미입력 시 추정용
  is_seasoning            boolean not null default false,    -- 양념은 추천 점수 계산에서 제외
  created_at              timestamptz not null default now()
);

create index ingredients_aliases_idx  on public.ingredients using gin (aliases);
create index ingredients_category_idx on public.ingredients (category);

-- ------------------------------------------------------------
-- 3. storage_items — 내 냉장고 재고
-- ------------------------------------------------------------
create type public.item_status as enum ('active', 'consumed', 'discarded');

create table public.storage_items (
  id            bigint generated always as identity primary key,
  user_id       uuid   not null references auth.users(id) on delete cascade,
  ingredient_id bigint not null references public.ingredients(id),
  qty           numeric(10,2),
  unit          text,                                        -- g / ml / 개 / 큰술
  purchased_at  date   not null default current_date,
  expires_on    date,                                        -- null 이면 구매일 + 기본 소비기한
  status        public.item_status not null default 'active',
  memo          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (expires_on is null or expires_on >= purchased_at)
);

-- 대시보드 주 조회 경로: 내 재고 중 활성 항목을 유통기한 순으로
create index storage_items_user_expiry_idx
  on public.storage_items (user_id, status, expires_on);

-- ------------------------------------------------------------
-- 4. recipes / recipe_steps / recipe_ingredients
--    출처: 식약처 조리식품의 레시피 DB (COOKRCP01)
-- ------------------------------------------------------------
create table public.recipes (
  id             bigint generated always as identity primary key,
  source         text not null default 'MFDS_COOKRCP01',
  source_id      text not null,                              -- RCP_SEQ
  name           text not null,                              -- RCP_NM
  way            text,                                       -- RCP_WAY2  (굽기/끓이기…)
  category       text,                                       -- RCP_PAT2  (반찬/국·찌개…)
  kcal           numeric,                                    -- INFO_ENG
  carb           numeric,                                    -- INFO_CAR
  protein        numeric,                                    -- INFO_PRO
  fat            numeric,                                    -- INFO_FAT
  sodium         numeric,                                    -- INFO_NA
  serving_weight text,                                       -- INFO_WGT
  image_url      text,                                       -- ATT_FILE_NO_MK
  hashtags       text,                                       -- HASH_TAG
  raw_parts      text,                                       -- RCP_PARTS_DTLS 원문 보존
  created_at     timestamptz not null default now(),
  unique (source, source_id)
);

comment on column public.recipes.raw_parts is
  '재료 원문. 파싱 결과가 틀렸을 때 되돌아올 근거이므로 절대 지우지 않는다.';

create table public.recipe_steps (
  recipe_id bigint   not null references public.recipes(id) on delete cascade,
  step_no   smallint not null,
  text      text     not null,
  image_url text,
  primary key (recipe_id, step_no)
);

create table public.recipe_ingredients (
  id            bigint generated always as identity primary key,
  recipe_id     bigint not null references public.recipes(id) on delete cascade,
  ingredient_id bigint references public.ingredients(id),    -- 매칭 실패 시 null
  raw_text      text   not null,                             -- "돼지고기 100g"
  qty           numeric,
  unit          text,
  is_essential  boolean not null default true                -- 양념이면 false
);

create index recipe_ingredients_recipe_idx     on public.recipe_ingredients (recipe_id);
create index recipe_ingredients_ingredient_idx on public.recipe_ingredients (ingredient_id);

-- ------------------------------------------------------------
-- 5. notification_log — 발송 이력 (중복 발송 방지)
-- ------------------------------------------------------------
create table public.notification_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null default 'expiry_digest',
  sent_on    date not null default current_date,
  payload    jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, kind, sent_on)                            -- 하루 한 번만
);

-- ------------------------------------------------------------
-- 6. updated_at 자동 갱신
-- ------------------------------------------------------------
create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger storage_items_touch
  before update on public.storage_items
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 7. RLS — 여기서부터가 보안의 실체
--    Supabase anon key는 공개되어도 된다. 데이터를 지키는 건 아래 정책이다.
-- ============================================================
alter table public.profiles           enable row level security;
alter table public.storage_items      enable row level security;
alter table public.notification_log   enable row level security;
alter table public.ingredients        enable row level security;
alter table public.recipes            enable row level security;
alter table public.recipe_steps       enable row level security;
alter table public.recipe_ingredients enable row level security;

-- 7-1. 개인 데이터: 본인 행만
create policy "본인 프로필 조회" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "본인 프로필 수정" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "본인 재고 조회" on public.storage_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "본인 재고 등록" on public.storage_items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "본인 재고 수정" on public.storage_items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "본인 재고 삭제" on public.storage_items
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "본인 알림이력 조회" on public.notification_log
  for select to authenticated using ((select auth.uid()) = user_id);
-- 쓰기 정책 없음 = Edge Function(service_role)만 기록할 수 있다

-- 7-2. 공용 데이터: 누구나 읽기, 쓰기는 service_role 전용(정책 없음)
create policy "재료 사전 공개" on public.ingredients
  for select to anon, authenticated using (true);
create policy "레시피 공개" on public.recipes
  for select to anon, authenticated using (true);
create policy "조리순서 공개" on public.recipe_steps
  for select to anon, authenticated using (true);
create policy "레시피재료 공개" on public.recipe_ingredients
  for select to anon, authenticated using (true);

-- ============================================================
-- 8. 검증 쿼리 (적용 후 직접 확인할 것)
-- ============================================================
-- 테이블 7개와 RLS 활성 여부
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' order by tablename;
--
-- 정책 목록
--   select tablename, policyname, cmd from pg_policies
--   where schemaname = 'public' order by tablename;
