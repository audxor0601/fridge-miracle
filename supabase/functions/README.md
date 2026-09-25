# Edge Function 배포

## expiry-digest

유통기한 다이제스트 메일. 설계서 5장 참고.

### 1. CLI 준비 (맥에서 한 번만)

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref hzcktczgpvsperrwihff
```

### 2. 비밀값 등록

```bash
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set DIGEST_SECRET=$(openssl rand -hex 24)
supabase secrets set MAIL_FROM=onboarding@resend.dev
supabase secrets set APP_URL=https://fridge-miracle.vercel.app
```

`SUPABASE_URL` 과 `SUPABASE_SERVICE_ROLE_KEY` 는 Edge Function 런타임이 자동으로
넣어준다. 따로 등록하지 않는다.

`DIGEST_SECRET` 은 출력해서 적어둔다. 아래 Cron 설정에 같은 값이 들어간다.

```bash
supabase secrets list          # 이름만 보인다. 값은 안 보인다
```

### 3. 배포

```bash
supabase functions deploy expiry-digest
```

### 4. 미리보기로 먼저 확인

발송하지 않고 "누구에게 무엇을 보낼 것인가"만 돌려준다.

```bash
curl -s "https://hzcktczgpvsperrwihff.supabase.co/functions/v1/expiry-digest?dry=1" \
  -H "x-digest-secret: 위에서_만든_값" | python3 -m json.tool
```

`targets: 0` 이 나오면 지금 KST 시각과 `profiles.notify_hour` 가 안 맞는 것이다.
기본값은 8시다. 테스트하려면 SQL Editor에서 본인 행의 `notify_hour` 를 현재
시각으로 바꾼다.

```sql
update public.profiles set notify_hour = 14 where id = auth.uid();
```

`dry=1` 을 떼면 실제로 보낸다.

### 5. 스케줄 등록

Supabase 대시보드 → Integrations → Cron → Create job.

- Schedule: `0 * * * *` (매시 정각)
- Type: Supabase Edge Function
- Function: `expiry-digest`
- HTTP Headers: `x-digest-secret` = 위에서 만든 값

매시 도는 이유는 사용자마다 받고 싶은 시각(`notify_hour`)이 다르기 때문이다.
함수가 매번 "지금 이 시각을 고른 사람"만 골라낸다.

### 알려진 제약

Resend는 도메인 인증 전까지 계정 소유자 본인 주소로만 발송을 허용한다.
다른 수신자에게는 403이 돌아온다. 함수는 이 실패를 삼키지 않고 응답에 그대로
싣고, `notification_log` 에도 기록하지 않는다. 안 보낸 걸 보냈다고 남기면
다음 날 재시도가 막힌다.
