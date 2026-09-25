#!/usr/bin/env python3
"""
사전에서 아무 데도 안 쓰이는 재료를 지운다.

파서를 고쳐서 다시 적재하면 예전에 잘못 만들어진 이름('마늘 1', '녹차(티백,')이
recipe_ingredients 연결을 잃고 사전에만 남는다. 이걸 그냥 두면
  · 재료 넣기 자동완성에 이상한 이름이 뜨고
  · expandPantry의 접미사 매칭이 엉뚱한 항목을 집는다.

지우기 전에 반드시 두 곳을 확인한다.
  ① recipe_ingredients 에서 참조하는가
  ② storage_items(사용자 재고)에서 참조하는가  ← 하나라도 있으면 절대 안 지운다

기본은 미리보기다. 출력을 눈으로 확인한 뒤에만 --apply 를 붙인다.

사용법:
    python3 scripts/prune_ingredients.py            # 미리보기
    python3 scripts/prune_ingredients.py --apply    # 실제 삭제
"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APPLY = "--apply" in sys.argv
TIMEOUT = 60


def env(key: str) -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith(f"{key}="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit(f".env 에 {key} 가 없습니다.")


URL = env("SUPABASE_URL").rstrip("/")
KEY = env("SUPABASE_SERVICE_ROLE_KEY")
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}


def call(method: str, path: str, prefer: str | None = None) -> list:
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}",
        method=method,
        headers={**HEADERS, **({"Prefer": prefer} if prefer else {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw.strip() else []
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} 실패 ({e.code})\n{e.read().decode('utf-8')[:500]}")


def page(table: str, select: str) -> list[dict]:
    out, offset = [], 0
    while True:
        rows = call("GET", f"{table}?select={select}&limit=1000&offset={offset}")
        if not rows:
            break
        out += rows
        offset += 1000
    return out


def main() -> None:
    print("조회 중...")
    ingredients = page("ingredients", "id,name")
    used_recipe = {r["ingredient_id"] for r in page("recipe_ingredients", "ingredient_id")
                   if r["ingredient_id"] is not None}
    used_storage = {r["ingredient_id"] for r in page("storage_items", "ingredient_id")}

    orphans = [g for g in ingredients
               if g["id"] not in used_recipe and g["id"] not in used_storage]

    print(f"\n사전 {len(ingredients)}개")
    print(f"  레시피에서 사용 중: {len(used_recipe & {g['id'] for g in ingredients})}개")
    print(f"  사용자 재고에서 사용 중: {len(used_storage)}개")
    print(f"  어디서도 안 쓰임: {len(orphans)}개\n")

    if not orphans:
        print("지울 것이 없습니다.")
        return

    print("지울 목록 (앞 60개):")
    for g in orphans[:60]:
        print(f"  {g['id']:>5}  {g['name']}")
    if len(orphans) > 60:
        print(f"  ... 외 {len(orphans) - 60}개")

    if not APPLY:
        print(f"\n[미리보기] 실제로 지우려면 --apply 를 붙여 다시 실행하세요.")
        return

    print(f"\n{len(orphans)}개 삭제 중...")
    ids = [g["id"] for g in orphans]
    for i in range(0, len(ids), 200):
        chunk = ids[i : i + 200]
        q = urllib.parse.quote(f"({','.join(map(str, chunk))})", safe="(),")
        call("DELETE", f"ingredients?id=in.{q}", prefer="return=minimal")
        print(f"  {min(i + 200, len(ids))}/{len(ids)}", end="\r", flush=True)

    after = len(page("ingredients", "id"))
    print(f"\n완료. 사전 {len(ingredients)} → {after}개")


if __name__ == "__main__":
    main()
