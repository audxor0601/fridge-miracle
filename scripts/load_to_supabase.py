#!/usr/bin/env python3
"""
파싱 결과를 Supabase에 적재 — Step 3 마무리

recipes / recipe_steps / ingredients / recipe_ingredients 네 테이블을 채운다.
여러 번 실행해도 결과가 같도록 만들었다(멱등).

준비:
    .env 에 아래 두 줄 추가
        SUPABASE_URL=https://xxxx.supabase.co
        SUPABASE_SERVICE_ROLE_KEY=eyJ...

    service_role 키는 RLS를 우회하는 관리자 키다. .env는 gitignore에 있으니
    깃허브로 새어나가지 않지만, 채팅·스크린샷에는 절대 올리지 말 것.

사용법:
    python3 scripts/load_to_supabase.py
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "cookrcp01.json"
PROC = ROOT / "data" / "processed"
BATCH = 500
TIMEOUT = 60


def env(key: str) -> str:
    val = os.environ.get(key)
    if not val:
        env_path = ROOT / ".env"
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                if line.strip().startswith(f"{key}="):
                    val = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not val:
        sys.exit(f".env 에 {key} 가 없습니다.")
    return val


URL = env("SUPABASE_URL").rstrip("/")
KEY = env("SUPABASE_SERVICE_ROLE_KEY")
HEADERS = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
}


def call(method: str, path: str, body=None, prefer: str | None = None) -> list:
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}",
        method=method,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None,
        headers={**HEADERS, **({"Prefer": prefer} if prefer else {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw.strip() else []
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} 실패 ({e.code})\n{e.read().decode('utf-8')[:500]}")


def upsert(table: str, rows: list[dict], conflict: str) -> None:
    for i in range(0, len(rows), BATCH):
        chunk = rows[i : i + BATCH]
        call(
            "POST",
            f"{table}?on_conflict={conflict}",
            chunk,
            prefer="resolution=merge-duplicates,return=minimal",
        )
        print(f"    {min(i + BATCH, len(rows)):>6}/{len(rows)}", end="\r", flush=True)
    print(f"    {len(rows)}건 완료      ")


def fetch_map(table: str, key_col: str) -> dict:
    """{key_col 값: id} 매핑을 페이지 단위로 모두 가져온다."""
    out, offset = {}, 0
    while True:
        rows = call("GET", f"{table}?select=id,{key_col}&limit=1000&offset={offset}")
        if not rows:
            break
        for r in rows:
            out[r[key_col]] = r["id"]
        offset += 1000
    return out


def num(v):
    try:
        return float(str(v).strip()) if str(v).strip() else None
    except ValueError:
        return None


def main() -> None:
    recipes_raw = json.loads(RAW.read_text(encoding="utf-8"))
    ingredients = json.loads((PROC / "ingredients.json").read_text(encoding="utf-8"))
    parsed = json.loads((PROC / "recipe_ingredients.json").read_text(encoding="utf-8"))

    # ── 1. recipes ───────────────────────────────────────
    print("[1/4] recipes")
    upsert(
        "recipes",
        [
            {
                "source": "MFDS_COOKRCP01",
                "source_id": str(r["RCP_SEQ"]),
                "name": r.get("RCP_NM", "").strip(),
                "way": (r.get("RCP_WAY2") or "").strip() or None,
                "category": (r.get("RCP_PAT2") or "").strip() or None,
                "kcal": num(r.get("INFO_ENG")),
                "carb": num(r.get("INFO_CAR")),
                "protein": num(r.get("INFO_PRO")),
                "fat": num(r.get("INFO_FAT")),
                "sodium": num(r.get("INFO_NA")),
                "serving_weight": (r.get("INFO_WGT") or "").strip() or None,
                "image_url": (r.get("ATT_FILE_NO_MK") or "").strip() or None,
                "hashtags": (r.get("HASH_TAG") or "").strip() or None,
                "raw_parts": r.get("RCP_PARTS_DTLS") or "",
            }
            for r in recipes_raw
            if r.get("RCP_NM", "").strip()
        ],
        "source,source_id",
    )

    recipe_id = fetch_map("recipes", "source_id")
    print(f"    recipes에 적재된 고유 건수: {len(recipe_id)}")

    # ── 2. recipe_steps ──────────────────────────────────
    print("[2/4] recipe_steps")
    steps = []
    for r in recipes_raw:
        rid = recipe_id.get(str(r["RCP_SEQ"]))
        if not rid:
            continue
        no = 0
        for i in range(1, 21):
            text = (r.get(f"MANUAL{i:02d}") or "").strip()
            if not text:
                continue
            no += 1
            steps.append(
                {
                    "recipe_id": rid,
                    "step_no": no,
                    "text": text,
                    "image_url": (r.get(f"MANUAL_IMG{i:02d}") or "").strip() or None,
                }
            )
    upsert("recipe_steps", steps, "recipe_id,step_no")

    # ── 3. ingredients ───────────────────────────────────
    print("[3/4] ingredients")
    upsert(
        "ingredients",
        [
            {
                "name": g["name"],
                "aliases": g.get("aliases", []),
                "category": "양념" if g["is_seasoning"] else "기타",
                "is_seasoning": g["is_seasoning"],
            }
            for g in ingredients
        ],
        "name",
    )
    ingredient_id = fetch_map("ingredients", "name")
    print(f"    ingredients 고유 건수: {len(ingredient_id)}")

    # ── 4. recipe_ingredients ────────────────────────────
    print("[4/4] recipe_ingredients (기존 행 삭제 후 재적재)")
    call("DELETE", "recipe_ingredients?id=gt.0", prefer="return=minimal")

    links, orphan = [], 0
    for p in parsed:
        rid = recipe_id.get(str(p["recipe_seq"]))
        gid = ingredient_id.get(p["name"])
        if not rid:
            orphan += 1
            continue
        links.append(
            {
                "recipe_id": rid,
                "ingredient_id": gid,
                "raw_text": p["raw_text"][:200],
                "qty": p["qty"],
                "unit": p["unit"],
                "is_essential": not p["is_seasoning"],
            }
        )
    upsert("recipe_ingredients", links, "id")
    if orphan:
        print(f"    레시피를 못 찾아 건너뛴 항목: {orphan}건")

    # ── 검증 ─────────────────────────────────────────────
    print("\n[검증] 실제 DB 건수")
    for t in ["recipes", "recipe_steps", "ingredients", "recipe_ingredients"]:
        req = urllib.request.Request(
            f"{URL}/rest/v1/{t}?select=*&limit=1",   # recipe_steps에는 id 컬럼이 없다
            headers={**HEADERS, "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"},
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            total = res.headers.get("Content-Range", "*/?").split("/")[-1]
        print(f"  {t:>20}: {total}건")


if __name__ == "__main__":
    main()
