#!/usr/bin/env python3
"""
/about 페이지에 띄울 실측 지표를 만든다.

1.0에서는 화면에 "Random Forest 88.4%"가 떠 있었지만 그 숫자를 만든 코드는
Math.random()이었다. 이 스크립트는 그 반대를 한다. 화면에 뜨는 모든 숫자를
여기서 원본 파일을 직접 세어 만들고, 각 숫자마다 '어디서 나왔는지'를 같이 적는다.

검증은 두 가지를 따로 본다. 처음에는 ①만 만들었는데, 그것만으로는
부족하다는 걸 ②가 없어서 못 봤다.

  ① 원문 대조 — 파싱한 이름이 원문 안에 글자 그대로 있는가.
     파서가 없는 글자를 지어내거나 잘라먹으면 걸린다 ('생선살 → 선살')
  ② 잔재 검사 — 이름에 수량·괄호·콜론 같은 찌꺼기가 남았는가.
     ①만 돌렸을 때 통과율이 99.91%였는데, 그 안에 '마늘 1', '녹차(티백,'
     같은 이름이 293개 섞여 있었다. '마늘 1'은 원문에 그대로 있으니
     ①을 통과한다. 자를 자리를 틀렸는지는 ①이 볼 수 없는 질문이었다.

사용법:
    python3 scripts/build_metrics.py
출력:
    src/data/metrics.json   (앱이 import 한다. 깃에 커밋된다)
"""

import json
import re
import subprocess
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "cookrcp01.json"
PROC = ROOT / "data" / "processed"
OUT = ROOT / "src" / "data" / "metrics.json"


def git(*args: str) -> str:
    try:
        return subprocess.run(
            ["git", *args], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout.strip()
    except Exception:
        return ""


def squeeze(s: str) -> str:
    return "".join(s.split())


def main() -> None:
    recipes = json.loads(RAW.read_text(encoding="utf-8"))
    parsed = json.loads((PROC / "recipe_ingredients.json").read_text(encoding="utf-8"))

    # ── 1. 수집 ──────────────────────────────────────────
    seqs = [r.get("RCP_SEQ") for r in recipes]
    steps = [
        sum(1 for i in range(1, 21) if str(r.get(f"MANUAL{i:02d}", "")).strip())
        for r in recipes
    ]
    hashtag_missing = sum(1 for r in recipes if not str(r.get("HASH_TAG", "")).strip())

    # ── 2. 파싱 ──────────────────────────────────────────
    with_qty = sum(1 for p in parsed if p.get("qty") is not None)
    names = {p["name"] for p in parsed}
    per_recipe: dict[str, int] = {}
    for p in parsed:
        if not p["is_seasoning"]:
            per_recipe[p["recipe_seq"]] = per_recipe.get(p["recipe_seq"], 0) + 1
    essential_avg = sum(per_recipe.values()) / len(per_recipe) if per_recipe else 0

    # ── 3. 역검증 — 파싱한 이름이 원문에 글자 그대로 있는가 ──
    raw_by_seq = {
        str(r["RCP_SEQ"]): squeeze(r.get("RCP_PARTS_DTLS", "") or "") for r in recipes
    }
    bad = [
        p for p in parsed
        if squeeze(p["name"]) not in raw_by_seq.get(str(p["recipe_seq"]), "")
    ]
    back_ok = len(parsed) - len(bad)

    # ── 4. 잔재 검사 — 이름에 수량·괄호·콜론이 남았는가 ──
    def has_residue(name: str) -> bool:
        if re.search(r"\d\s*$", name):              # "마늘 1"
            return True
        if name.count("(") != name.count(")"):       # "녹차(티백,"
            return True
        if ":" in name:                              # "견과류 : 아몬드"
            return True
        if name != "팔각" and re.search(r"(각각|각|씩)$", name):  # "파프리카 각"
            return True
        return False

    dirty = [p for p in parsed if has_residue(p["name"])]
    clean_ok = len(parsed) - len(dirty)

    metrics = {
        "measuredAt": date.today().isoformat(),
        "commit": git("rev-parse", "--short", "HEAD"),
        "collect": {
            "source": "식품의약품안전처 조리식품의 레시피 DB (COOKRCP01)",
            "script": "scripts/fetch_recipes.py",
            "recipes": len(recipes),
            "duplicateSeq": len(seqs) - len(set(seqs)),
            "avgSteps": round(sum(steps) / len(steps), 1),
            "hashtagMissingPct": round(hashtag_missing / len(recipes) * 100, 1),
        },
        "parse": {
            "script": "scripts/parse_ingredients.py",
            "rows": len(parsed),
            "withQtyPct": round(with_qty / len(parsed) * 100, 1),
            "uniqueNames": len(names),
            "essentialPerRecipe": round(essential_avg, 1),
        },
        "verify": {
            "how": "파싱한 재료 이름이 해당 레시피 원문에 글자 그대로 들어 있는지 전수 대조 (공백 무시)",
            "script": "scripts/build_metrics.py",
            "checked": len(parsed),
            "passed": back_ok,
            "passRate": round(back_ok / len(parsed) * 100, 2),
            "failSamples": [
                {"name": p["name"], "raw": p["raw_text"][:40]} for p in bad[:8]
            ],
        },
        "residue": {
            "how": "이름에 수량·괄호·콜론 같은 찌꺼기가 남았는지 검사. 원문 대조만으로는 '마늘 1'을 못 걸러서 따로 만들었다",
            "script": "scripts/build_metrics.py",
            "checked": len(parsed),
            "passed": clean_ok,
            "passRate": round(clean_ok / len(parsed) * 100, 2),
            "failSamples": [
                {"name": p["name"], "raw": p["raw_text"][:40]} for p in dirty[:8]
            ],
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metrics, ensure_ascii=False, indent=2))
    print(f"\n저장: {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
