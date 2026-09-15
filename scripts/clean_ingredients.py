#!/usr/bin/env python3
"""
재료 사전 정제 — Step 5.5

실제로 재고를 넣어보니 사전에 쓰레기 이름이 남아 있었다.
  마늘다진것, 참치(캔,, 양념]고추장, 반죽재료) 강력분, 2인분 ] 양파

그대로 두면 Step 7 추천이 깨진다. 추천은 ingredient_id로 조인하는데
'마늘'과 '마늘다진것'이 다른 행이면 매칭이 안 된다.

하는 일:
  1) 규칙으로 표준명을 다시 뽑는다
  2) 같은 표준명끼리 묶어 대표 행 하나만 남기고, 나머지 이름은 aliases에 보존
  3) recipe_ingredients와 storage_items가 가리키는 id를 대표 행으로 옮긴다
  4) 참조가 사라진 중복 행을 지운다

사용법:
    python3 scripts/clean_ingredients.py            # 미리보기 (아무것도 바꾸지 않음)
    python3 scripts/clean_ingredients.py --apply    # 실제 적용
"""

import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APPLY = "--apply" in sys.argv


def env(key: str) -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith(f"{key}="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit(f".env 에 {key} 가 없습니다.")


URL = env("SUPABASE_URL").rstrip("/")
KEY = env("SUPABASE_SERVICE_ROLE_KEY")
HEAD = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}


def call(method: str, path: str, body=None, prefer="return=minimal"):
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}",
        method=method,
        data=json.dumps(body, ensure_ascii=False).encode() if body is not None else None,
        headers={**HEAD, "Prefer": prefer},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            raw = res.read().decode()
            return json.loads(raw) if raw.strip() else []
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} 실패 ({e.code})\n{e.read().decode()[:400]}")


SUFFIX = re.compile(r"(다진\s*것|썬\s*것|간\s*것|한\s*것|다짐|적당량|약간)$")
TAG = re.compile(r"<[^>]{1,10}>")                    # <br> 같은 HTML 조각
LEAD_MARK = re.compile(r"^[•·●○▶*\-–—\s]+")           # 앞에 붙은 글머리표
TAIL_QTY = re.compile(r"[\s,]*\d+(\.\d+)?\s*[~\-]?\s*\d*(\.\d+)?\s*$")  # 끝에 남은 '3~', '0.25'
CLOSER = re.compile(r"^.*[)\]]\s*")                  # 마지막 닫는 괄호까지

# 앞에 붙는 손질·조리 상태 수식어. "다진 마늘"과 "마늘"이 다른 행이면 추천이 깨진다.
# 냉장고 재고 관점에서는 같은 재료이고, 원문은 recipe_ingredients.raw_text에 남는다.
PREFIX = [
    "굵게 다진", "곱게 다진", "잘게 썬", "어슷 썬", "채 썬", "채썬", "얇게 썬",
    "다진", "썬", "저민", "구운", "삶은", "데친", "볶은", "찐", "튀긴",
    "말린", "불린", "손질한", "갈은", "간",
]


def canonical(name: str) -> str:
    n = unicodedata.normalize("NFC", name).strip()
    n = TAG.sub("", n)
    n = LEAD_MARK.sub("", n)

    # 닫는 괄호 뒤에 내용이 있으면 그게 재료다.
    #   "속재료) 고구마" → 고구마
    #   "• [추가 재료] 쌈두부" → 쌈두부
    #   "소금적당량 [소재료] 김치" → 김치
    m = CLOSER.match(n)
    if m and n[m.end():].strip():
        n = n[m.end():].strip()

    n = re.sub(r"\([^)]*\)", "", n)     # 닫힌 괄호 설명 제거
    for opener in "([":                  # 열린 채 잘린 괄호 → 앞부분만
        if opener in n:
            n = n.split(opener)[0]

    n = n.strip(" ,·-–—:]})")
    n = TAIL_QTY.sub("", n)
    n = SUFFIX.sub("", n).strip()

    changed = True                       # "굵게 다진 마늘"처럼 겹친 경우
    while changed:
        changed = False
        for pre in PREFIX:
            # 한 글자 수식어는 반드시 공백이 뒤따라야 한다.
            # 이걸 빼먹어서 '간편 어간장'이 '편 어간장'이 됐다.
            token = pre + " " if len(pre) == 1 else pre
            if n.startswith(token) and len(n) > len(token) + 1:
                n = n[len(token):].strip()
                changed = True
                break
    n = re.sub(r"\s+", " ", n).strip(" .,·-–—:]})")

    # 한글이 하나도 안 남았으면 정제 실패로 보고 원본을 쓴다
    if not n or not re.search(r"[가-힣]", n):
        return unicodedata.normalize("NFC", name).strip()
    return n


def fetch_all(table: str, select: str) -> list[dict]:
    out, offset = [], 0
    while True:
        rows = call("GET", f"{table}?select={select}&limit=1000&offset={offset}&order=id", prefer="count=none")
        if not rows:
            break
        out += rows
        offset += 1000
    return out


def main() -> None:
    ings = fetch_all("ingredients", "id,name,aliases,is_seasoning,category")
    print(f"현재 사전: {len(ings)}개\n")

    # 표준명별로 묶는다
    groups: dict[str, list[dict]] = defaultdict(list)
    for g in ings:
        groups[canonical(g["name"])].append(g)

    renames, merges = [], []
    id_map: dict[int, int] = {}
    survivors: dict[int, dict] = {}

    for canon, members in groups.items():
        # 이미 표준명 그대로인 행을 대표로. 없으면 id가 가장 작은 행.
        exact = [m for m in members if m["name"] == canon]
        keep = exact[0] if exact else sorted(members, key=lambda m: m["id"])[0]
        losers = [m for m in members if m["id"] != keep["id"]]

        if keep["name"] != canon:
            renames.append((keep["name"], canon))
        if losers:
            merges.append((canon, [m["name"] for m in losers]))

        alias_set = set(keep.get("aliases") or [])
        for m in losers:
            id_map[m["id"]] = keep["id"]
            alias_set.add(m["name"])
            alias_set.update(m.get("aliases") or [])
        alias_set.discard(canon)

        if keep["name"] != canon or losers:
            survivors[keep["id"]] = {
                "name": canon,
                "aliases": sorted(alias_set),
                # 합쳐진 것 중 하나라도 양념이면 양념으로 본다
                "is_seasoning": keep["is_seasoning"] or any(m["is_seasoning"] for m in losers),
            }

    print(f"정리 후 고유 이름: {len(groups)}개  (줄어드는 행 {len(id_map)}개)")
    print(f"이름만 바뀌는 행: {len(renames)}개")
    print(f"합쳐지는 묶음: {len(merges)}개\n")

    print("[이름 변경 예시 20개]")
    for before, after in renames[:20]:
        print(f"  {before!r} → {after!r}")

    print("\n[병합 예시 20개]")
    for canon, names in sorted(merges, key=lambda x: -len(x[1]))[:20]:
        print(f"  {canon} ← {', '.join(repr(n) for n in names[:5])}{' ...' if len(names) > 5 else ''}")

    # 영향받는 참조 수
    ri = fetch_all("recipe_ingredients", "id,ingredient_id")
    si = fetch_all("storage_items", "id,ingredient_id")
    ri_hit = sum(1 for r in ri if r["ingredient_id"] in id_map)
    si_hit = sum(1 for s in si if s["ingredient_id"] in id_map)
    print(f"\n옮겨야 할 참조: recipe_ingredients {ri_hit}건 / storage_items {si_hit}건")

    if not APPLY:
        print("\n미리보기입니다. 실제로 적용하려면 --apply 를 붙여 다시 실행하세요.")
        return

    print("\n적용 시작")
    print("  1/4 대표 행 이름·별칭 갱신")
    for keep_id, patch in survivors.items():
        call("PATCH", f"ingredients?id=eq.{keep_id}", patch)

    print("  2/4 recipe_ingredients 참조 이동")
    for old, new in id_map.items():
        call("PATCH", f"recipe_ingredients?ingredient_id=eq.{old}", {"ingredient_id": new})

    print("  3/4 storage_items 참조 이동")
    for old, new in id_map.items():
        call("PATCH", f"storage_items?ingredient_id=eq.{old}", {"ingredient_id": new})

    print("  4/4 중복 행 삭제")
    ids = list(id_map)
    for i in range(0, len(ids), 100):
        chunk = ",".join(str(x) for x in ids[i : i + 100])
        call("DELETE", f"ingredients?id=in.({chunk})")

    after = fetch_all("ingredients", "id,name")
    left_bad = [g["name"] for g in after if re.search(r"[()\[\]]|,$", g["name"])]
    print(f"\n[검증] 사전 {len(ings)} → {len(after)}개")
    print(f"괄호·쉼표가 남은 이름: {len(left_bad)}개", left_bad[:10] if left_bad else "")


if __name__ == "__main__":
    main()
