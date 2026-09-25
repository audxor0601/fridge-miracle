#!/usr/bin/env python3
"""
데모 계정 냉장고 채우기.

배포하면 모르는 사람이 링크로 들어온다. 빈 냉장고로 들어오면 추천 화면에도
버림 기록에도 아무것도 없어서, 이 서비스가 뭘 하는지 안 보인다.

그래서 재료가 들어 있고 먹음·버림 기록도 쌓인 계정을 하나 만들어둔다.
화면마다 보여주려는 것이 다르므로 데이터도 거기 맞춰 넣는다.

  · 기한이 지난 것 1건    → 냉장고 상단 폐기 배너
  · D-1 ~ D-3 여러 건     → 추천 정렬의 3순위(긴급도)가 동작하는 모습
  · 고기·두부·채소 섞기   → 카테고리 기반 대체 재료 매칭
  · 먹음/버림 12건        → 버림 비율이 표시되는 상태 (MIN_SAMPLE=10)

준비:
  ① 배포된 사이트에서 데모 계정으로 회원가입을 먼저 해둔다
  ② .env 에 DEMO_EMAIL=... 한 줄 추가 (비밀번호는 여기 적지 않는다)

사용법:
    python3 scripts/seed_demo.py            # 미리보기
    python3 scripts/seed_demo.py --apply    # 실제 적재 (기존 재고는 지우고 새로 넣는다)
"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APPLY = "--apply" in sys.argv
TIMEOUT = 60
TODAY = date.today()


def env(key: str) -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith(f"{key}="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit(f".env 에 {key} 가 없습니다.")


URL = env("SUPABASE_URL").rstrip("/")
KEY = env("SUPABASE_SERVICE_ROLE_KEY")
DEMO_EMAIL = env("DEMO_EMAIL")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}


def call(method: str, path: str, body=None, prefer=None, base="rest/v1"):
    req = urllib.request.Request(
        f"{URL}/{base}/{path}",
        method=method,
        data=json.dumps(body, ensure_ascii=False).encode() if body is not None else None,
        headers={**H, **({"Prefer": prefer} if prefer else {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            raw = res.read().decode()
            return json.loads(raw) if raw.strip() else []
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} 실패 ({e.code})\n{e.read().decode()[:500]}")


def d(days: int) -> str:
    return (TODAY + timedelta(days=days)).isoformat()


# 재료명, 수량, 단위, 구매일(오늘로부터), 유통기한(오늘로부터)
ACTIVE = [
    ("상추",       100, "g",  -9, -2),   # 기한 지남 → 폐기 배너
    ("마늘",       200, "g",  -6,  1),
    ("순두부",       1, "개", -3,  2),
    ("대파",       150, "g",  -4,  3),
    ("두부",       320, "g",  -2,  4),
    ("대패삼겹살", 500, "g",  -2,  5),
    ("애호박",     200, "g",  -3,  6),
    ("달걀",        10, "개", -5, 14),
    ("양파",       300, "g",  -7, 10),
    ("배추김치",   400, "g", -14, 30),
    ("고추장",     200, "g", -30, 180),
    ("매운고춧가루", 500, "g", -30, 300),
]

# 재료명, 상태, 처리일(오늘로부터), 구매일, 유통기한
HISTORY = [
    ("애호박",   "consumed",  -2,  -8,  -1),
    ("달걀",     "consumed",  -3, -20,   5),
    ("두부",     "consumed",  -5, -10,  -4),
    ("양파",     "consumed",  -6, -16,   2),
    ("대파",     "consumed",  -8, -15,  -6),
    ("순두부",   "consumed", -10, -14,  -9),
    ("배추김치", "consumed", -12, -40,  20),
    ("마늘",     "consumed", -15, -25,  -8),
    ("상추",     "discarded", -4, -14,  -7),   # 기한 3일 지나서 버림
    ("애호박",   "discarded", -9, -19, -11),   # 기한 2일 지나서 버림
    ("대파",     "discarded", -13, -23, -18),  # 기한 5일 지나서 버림
    ("두부",     "discarded", -18, -22, -16),  # 기한 오기 전에 버림
]


def main() -> None:
    users = call("GET", f"admin/users?per_page=200", base="auth/v1")
    rows = users.get("users", users) if isinstance(users, dict) else users
    me = next((u for u in rows if u.get("email") == DEMO_EMAIL), None)
    if not me:
        sys.exit(
            f"'{DEMO_EMAIL}' 계정을 찾을 수 없습니다.\n"
            f"배포된 사이트에서 이 이메일로 회원가입을 먼저 하세요."
        )
    uid = me["id"]
    print(f"데모 계정: {DEMO_EMAIL}")

    names = {n for n, *_ in ACTIVE} | {n for n, *_ in HISTORY}
    q = urllib.parse.quote(f"({','.join(names)})", safe="(),")
    found = {g["name"]: g["id"] for g in call("GET", f"ingredients?select=id,name&name=in.{q}")}
    missing = names - found.keys()
    if missing:
        print(f"\n사전에 없는 재료: {', '.join(sorted(missing))}")
        print("이 재료는 건너뜁니다. 사전에 있는 이름으로 바꾸려면 스크립트를 수정하세요.")

    items = []
    for name, qty, unit, bought, expires in ACTIVE:
        if name not in found:
            continue
        items.append({
            "user_id": uid, "ingredient_id": found[name], "qty": qty, "unit": unit,
            "purchased_at": d(bought), "expires_on": d(expires), "status": "active",
        })
    for name, status, done, bought, expires in HISTORY:
        if name not in found:
            continue
        items.append({
            "user_id": uid, "ingredient_id": found[name], "qty": 1, "unit": "개",
            "purchased_at": d(bought), "expires_on": d(expires), "status": status,
            "updated_at": f"{d(done)}T12:00:00+09:00",
        })

    active = sum(1 for i in items if i["status"] == "active")
    print(f"\n넣을 것: 재고 {active}건 / 기록 {len(items) - active}건")
    print(f"  기한 지난 재고: {sum(1 for n, *_ , e in ACTIVE if e < 0 and n in found)}건 (폐기 배너용)")
    print(f"  먹음 {sum(1 for i in items if i['status'] == 'consumed')}건 / "
          f"버림 {sum(1 for i in items if i['status'] == 'discarded')}건")

    if not APPLY:
        print("\n[미리보기] 실제로 넣으려면 --apply 를 붙이세요.")
        print("기존 데모 재고·기록은 전부 지우고 새로 넣습니다.")
        return

    print("\n기존 데이터 삭제 중...")
    call("DELETE", f"storage_items?user_id=eq.{uid}", prefer="return=minimal")
    print(f"{len(items)}건 적재 중...")
    call("POST", "storage_items", items, prefer="return=minimal")

    check = call("GET", f"storage_items?select=status&user_id=eq.{uid}")
    counts: dict[str, int] = {}
    for r in check:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    print(f"완료. {counts}")


if __name__ == "__main__":
    main()
