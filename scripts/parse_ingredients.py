#!/usr/bin/env python3
"""
재료 원문(RCP_PARTS_DTLS) 파싱 — Step 3

자유 텍스트를 (재료명, 수량, 단위, 필수여부)로 분해한다.
설계 근거: docs/설계서_v0.1.md 6장

출력:
    data/processed/recipe_ingredients.json  파싱 결과 (DB 적재용)
    data/processed/ingredients.json         재료 사전 (표준명 + 별칭)
    data/processed/top300_review.csv        상위 300개 수기 검수용
    data/processed/parse_report.md          통계
    data/processed/verify_sample.md         무작위 30건 원문 대조표
"""

import csv
import json
import random
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "cookrcp01.json"
OUT = ROOT / "data" / "processed"
SEED = 42

# ── 사전 정의 ────────────────────────────────────────────

# 재료가 아니라 구획 제목인 줄. 이 단어만 있는 항목은 버린다.
SECTION_WORDS = {
    "주재료", "부재료", "재료", "양념", "양념장", "양념재료", "소스", "소스재료",
    "고명", "장식", "곁들임", "육수", "국물", "밑간", "드레싱", "만들기",
    "기타", "선택", "토핑", "속재료", "반죽",
}

# 상비 양념 — 누구나 가지고 있다고 보고 커버리지 계산에서 제외한다.
SEASONINGS = {
    "물", "소금", "설탕", "간장", "식초", "참기름", "들기름", "식용유", "올리브유",
    "후춧가루", "후추", "고춧가루", "고추장", "된장", "쌈장", "맛술", "청주", "미림",
    "물엿", "요리당", "올리고당", "꿀", "통깨", "참깨", "깨소금", "액젓", "멸치액젓",
    "까나리액젓", "굴소스", "케첩", "마요네즈", "머스터드", "설탕시럽", "전분",
    "녹말가루", "전분가루", "다시마육수", "치킨스톡", "월계수잎", "생강즙", "매실액",
    "튀김기름", "포도씨유", "카놀라유", "현미유", "참치액", "다시다", "미원",
}

# 재료명 앞에 붙는 조리 상태 수식어 — 표준명에서 떼어낸다.
MODIFIERS = [
    "굵게 다진", "곱게 다진", "잘게 썬", "어슷 썬", "채 썬", "채썬", "다진", "썬",
    "구운", "삶은", "데친", "볶은", "찐", "튀긴", "말린", "불린", "손질한", "저민",
    "슬라이스", "다진마늘용", "곱게", "굵게", "잘게", "얇게",
]

# 앞뒤에 붙어도 같은 재료로 볼 접두·접미
PREFIX_STRIP = ["저염", "무염", "무가당", "저지방", "국내산", "냉동"]

UNITS = (
    "kg|g|ml|L|리터|개|장|줄기|모|마리|쪽|톨|컵|큰술|작은술|스푼|봉지|캔|알|"
    "자밤|꼬집|조각|대|포기|송이|꼬치|묶음|팩|병|숟갈|T|t|㎖|㎗|㎘|㏄|cc"
)
FRACTIONS = {
    "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75,
    "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8, "⅙": 1 / 6, "⅚": 5 / 6,
    "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
}

_FRAC = "".join(FRACTIONS)
QTY_RE = re.compile(rf"(\d+(?:[./]\d+)?[{_FRAC}]?|[{_FRAC}])\s*({UNITS})")
VAGUE_RE = re.compile(r"(약간|적당량|조금|기호에\s*따라)")
# 단위 없이 숫자만 적은 원문("배추김치(줄기부분) 30")의 끝자리 수량
BARE_QTY_RE = re.compile(r"(\d+(?:[./]\d+)?)\s*$")
# 여러 색·종류를 한 번에 적을 때 붙는 꼬리("파프리카(빨강, 노랑) 각 7g")
EACH_TAIL_RE = re.compile(r"\s*(각각|각|씩)\s*$")


def mask_parens(text: str) -> str:
    """괄호 안을 같은 길이의 공백으로 덮는다. 위치(인덱스)는 그대로 유지된다.

    수량을 찾을 때 괄호 밖을 먼저 봐야 한다. 안 그러면 '녹차(티백, 1개)'에서
    괄호 안의 '1개'가 수량으로 잡히고, 이름이 '녹차(티백,' 이 되어 버린다.
    실제로 이 버그로 107개 이름이 깨져 있었다.
    """
    out, depth = [], 0
    for ch in text:
        if ch in "([{":
            depth += 1
            out.append(" ")
        elif ch in ")]}":
            depth = max(0, depth - 1)
            out.append(" ")
        else:
            out.append(" " if depth else ch)
    return "".join(out)


def to_number(token: str) -> float | None:
    """'1/2', '1⅓', '½', '2.5' → float"""
    if not token:
        return None
    total = 0.0
    for ch in list(FRACTIONS):
        if ch in token:
            total += FRACTIONS[ch]
            token = token.replace(ch, "")
    token = token.strip()
    if not token:
        return round(total, 3) or None
    try:
        if "/" in token:
            a, b = token.split("/", 1)
            total += float(a) / float(b)
        else:
            total += float(token)
    except (ValueError, ZeroDivisionError):
        return round(total, 3) or None
    return round(total, 3)


def _split_outside_parens(line: str) -> list[str]:
    """괄호 밖의 쉼표에서만 자른다. '물 300ml(1½컵, 200g)' 이 쪼개지지 않도록."""
    out, buf, depth = [], [], 0
    for ch in line:
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth = max(0, depth - 1)
        if ch in ",，" and depth == 0:
            out.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    out.append("".join(buf).strip())
    return [o for o in out if o]


def split_items(text: str) -> list[str]:
    """원문을 항목 단위로 자른다. 섹션 마커·줄바꿈·쉼표 순으로 분해."""
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r"[●○·*※▶]", "\n", text)
    items = []
    for line in text.split("\n"):
        line = line.strip().strip("[]()")
        if not line:
            continue
        # "양념장 : 간장 5g, ..." 처럼 제목이 붙은 줄은 콜론 뒤만 취한다
        if ":" in line:
            head, tail = line.split(":", 1)
            if len(head.strip()) <= 12:      # 긴 문장은 콜론이 있어도 제목이 아니다
                line = tail
        for c in _split_outside_parens(line):
            items += _split_sections(c)
    return [i for i in items if i]


# 여는 괄호 없이 ')' 로 끝나는 머리말 — "속재료)  고구마 30g"
ORPHAN_CLOSE_RE = re.compile(r"^[^()]{1,14}\)\s*")


def _split_sections(item: str) -> list[str]:
    """항목 하나가 사실은 '재료 + 다음 섹션 제목 + 재료' 인 경우를 더 자른다.

    원문에 '다진 실파 2 양념장: 간장 3' 처럼 섹션 제목이 줄 중간에서 시작하는
    경우가 있다. 줄 단위 콜론 규칙은 제목이 줄 맨 앞에 올 때만 동작해서
    여기서 한 번 더 본다.
    """
    item = item.strip()
    if not item:
        return []

    # 짝 없는 ')' 앞은 머리말이다. "속재료) 고구마" → "고구마"
    if ")" in item and item.index(")") < (item.index("(") if "(" in item else len(item)):
        item = ORPHAN_CLOSE_RE.sub("", item, count=1).strip()

    if ":" not in item:
        return [item]

    head, tail = item.split(":", 1)
    head = head.strip()
    # 머리 끝에 붙은 섹션 제목을 떼면 앞 재료만 남는다
    for w in sorted(SECTION_WORDS, key=len, reverse=True):
        if head.endswith(w):
            head = head[: -len(w)].strip()
            break
    return [x for x in (head, tail.strip()) if x]


def normalize_name(raw: str) -> str:
    """재료명에서 수식어·괄호·군더더기를 떼어 표준명 후보를 만든다."""
    name = unicodedata.normalize("NFC", raw)
    name = re.sub(r"\([^)]*\)", "", name)          # 괄호 안 설명 제거
    name = re.sub(r"^\d+[.)]\s*", "", name)        # 앞 번호 제거
    name = name.strip(" ·-–—:[]()")

    for w in SECTION_WORDS:                         # "재료 토란" 처럼 제목이 붙은 경우
        if name.startswith(w + " "):
            name = name[len(w):].strip()

    changed = True
    while changed:                                  # "굵게 다진 마늘" 같은 중복 수식어
        changed = False
        for m in MODIFIERS:
            if name.startswith(m + " ") or name.startswith(m):
                name = name[len(m):].strip()
                changed = True
    for p in PREFIX_STRIP:
        if name.startswith(p) and len(name) > len(p) + 1:
            name = name[len(p):].strip()
    # '각 7g'의 '각'은 재료명이 아니다. 단, 팔각은 향신료 이름이므로 건드리지 않는다
    if name != "팔각":
        name = EACH_TAIL_RE.sub("", name)
    return re.sub(r"\s+", " ", name).strip()


def parse_item(item: str) -> dict | None:
    """항목 하나를 {name, qty, unit, vague}로. 재료가 아니면 None."""
    item = item.strip()
    if not item or len(item) > 60:
        return None

    masked = mask_parens(item)
    paren_at = item.find("(")
    cut = paren_at if paren_at >= 0 else len(item)

    # 수량은 괄호 밖에서 먼저 찾는다 ("연두부 75g(3/4모)" → 75g)
    m = QTY_RE.search(masked)
    if m:
        name_end, qty, unit = m.start(), to_number(m.group(1)), m.group(2)
    else:
        # 밖에 없으면 괄호 안을 본다 ("오이(55g)" → 55g, 이름은 괄호 앞까지)
        m = QTY_RE.search(item)
        if m:
            name_end, qty, unit = cut, to_number(m.group(1)), m.group(2)
        else:
            # 단위 없이 숫자만 적은 경우 ("배추김치(줄기부분) 30" → 30)
            m = BARE_QTY_RE.search(masked.rstrip())
            if m:
                name_end, qty, unit = min(cut, m.start()), to_number(m.group(1)), None
            else:
                name_end, qty, unit = None, None, None

    # 수량이 붙어 있으면 제목이 아니라 재료다 ("육수(200g)" vs 제목 "육수")
    plain = re.sub(r"\([^)]*\)", "", item).strip(" ·-–—:[]()")
    if qty is None and (plain in SECTION_WORDS or plain.rstrip("장") in SECTION_WORDS):
        return None

    vague = bool(VAGUE_RE.search(item))

    if name_end is not None:
        name_part = item[:name_end]
    elif vague:
        name_part = VAGUE_RE.split(item)[0]
    else:
        name_part = item

    name = normalize_name(name_part)
    # 괄호가 안 닫힌 원문("마늘 15(3개")에서는 이름 끝에 수량이 남는다
    tail_num = BARE_QTY_RE.search(name)
    if tail_num and re.search(r"[가-힣A-Za-z]", name[: tail_num.start()]):
        if qty is None:
            qty = to_number(tail_num.group(1))
        name = name[: tail_num.start()].strip()
    if not name or (qty is None and name in SECTION_WORDS):
        return None
    if not re.search(r"[가-힣A-Za-z]", name):
        return None
    return {"name": name, "qty": qty, "unit": unit, "vague": vague}


def main() -> None:
    rows = json.loads(RAW.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)

    parsed: list[dict] = []
    skipped: list[str] = []
    name_counter: Counter[str] = Counter()
    per_recipe: dict[str, list[dict]] = defaultdict(list)

    for r in rows:
        text = r.get("RCP_PARTS_DTLS", "") or ""
        seq = r.get("RCP_SEQ")
        dish = unicodedata.normalize("NFC", r.get("RCP_NM", "")).replace(" ", "")

        for item in split_items(text):
            # 첫 줄에 요리명이 반복된 경우 제외
            if unicodedata.normalize("NFC", item).replace(" ", "") == dish:
                continue
            got = parse_item(item)
            if got is None:
                skipped.append(item)
                continue
            got["recipe_seq"] = seq
            got["raw_text"] = item
            got["is_seasoning"] = got["name"] in SEASONINGS
            parsed.append(got)
            per_recipe[seq].append(got)
            name_counter[got["name"]] += 1

    # ── 재료 사전 ────────────────────────────────────────
    ingredients = [
        {
            "name": name,
            "count": cnt,
            "is_seasoning": name in SEASONINGS,
            "aliases": [],
        }
        for name, cnt in name_counter.most_common()
    ]
    (OUT / "ingredients.json").write_text(
        json.dumps(ingredients, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    (OUT / "recipe_ingredients.json").write_text(
        json.dumps(parsed, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    # ── 상위 300개 수기 검수 파일 ────────────────────────
    with (OUT / "top300_review.csv").open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["빈도", "자동정규화명", "수정할표준명", "별칭(쉼표구분)", "양념여부", "비고"])
        for name, cnt in name_counter.most_common(300):
            w.writerow([cnt, name, "", "", "Y" if name in SEASONINGS else "", ""])

    # ── 통계 ─────────────────────────────────────────────
    total_items = len(parsed) + len(skipped)
    with_qty = sum(1 for p in parsed if p["qty"] is not None)
    seasoning_n = sum(1 for p in parsed if p["is_seasoning"])
    essential_per_recipe = [
        sum(1 for x in v if not x["is_seasoning"]) for v in per_recipe.values()
    ]
    top300_share = sum(c for _, c in name_counter.most_common(300)) / len(parsed) * 100

    report = [
        "# 재료 파싱 리포트",
        "",
        f"- 대상 레시피: **{len(per_recipe)}건**",
        f"- 분해한 항목: **{total_items}개**",
        f"- 재료로 인정: **{len(parsed)}개** ({len(parsed)/total_items*100:.1f}%)",
        f"- 제외(섹션 제목 등): **{len(skipped)}개**",
        f"- 수량까지 확보: **{with_qty}개** ({with_qty/len(parsed)*100:.1f}%)",
        "",
        f"- 고유 표준명: **{len(name_counter)}개** (정규화 전 2,395개)",
        f"- 상위 300개가 덮는 비율: **{top300_share:.1f}%**",
        f"- 양념으로 분류: **{seasoning_n}개** ({seasoning_n/len(parsed)*100:.1f}%)",
        "",
        f"- 레시피당 필수재료 수: 평균 **{sum(essential_per_recipe)/len(essential_per_recipe):.1f}개** "
        f"(최소 {min(essential_per_recipe)} / 최대 {max(essential_per_recipe)})",
        "",
        "## 제외된 항목 30개 (오탈락 점검용)",
        "",
    ]
    report += [f"- `{s[:50]}`" for s in skipped[:30]]
    (OUT / "parse_report.md").write_text("\n".join(report) + "\n", encoding="utf-8")

    # ── 무작위 30건 대조표 ───────────────────────────────
    random.seed(SEED)
    sample = random.sample([r for r in rows if r.get("RCP_PARTS_DTLS")], 30)
    lines = [
        "# 파싱 검증 — 무작위 30건",
        "",
        "원문과 파싱 결과를 직접 대조한다. 틀린 항목에 `[X]`를 표시하고,",
        "맨 아래 정확도를 계산한다. 목표는 **85% 이상**.",
        "",
        "---",
        "",
    ]
    for i, r in enumerate(sample, 1):
        seq = r.get("RCP_SEQ")
        lines += [
            f"## {i}. {r.get('RCP_NM')} (RCP_SEQ {seq})",
            "",
            "**원문**",
            "```",
            (r.get("RCP_PARTS_DTLS") or "").strip(),
            "```",
            "",
            "**파싱 결과**",
            "",
            "| 재료 | 수량 | 단위 | 양념 | 판정 |",
            "|---|---:|---|:---:|:---:|",
        ]
        for p in per_recipe.get(seq, []):
            qty = "" if p["qty"] is None else p["qty"]
            unit = p["unit"] or ("약간" if p["vague"] else "")
            lines.append(
                f"| {p['name']} | {qty} | {unit} | {'Y' if p['is_seasoning'] else ''} |  |"
            )
        lines.append("")
    lines += ["---", "", "## 판정", "", "- 전체 항목 수: ", "- 틀린 항목 수: ", "- 정확도: "]
    (OUT / "verify_sample.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("\n".join(report[:16]))
    print(f"\n검수 파일: {OUT/'top300_review.csv'}")
    print(f"대조표:    {OUT/'verify_sample.md'}")


if __name__ == "__main__":
    main()
