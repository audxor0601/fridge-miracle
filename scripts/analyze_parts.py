#!/usr/bin/env python3
"""
RCP_PARTS_DTLS(재료 원문) 구조 분석 — Step 3 파싱 규칙을 정하기 위한 사전 조사.

파싱 규칙을 상상으로 짜지 않고, 1156건이 실제로 어떤 모양인지 세어본다.
"""

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
rows = json.loads((ROOT / "data" / "raw" / "cookrcp01.json").read_text(encoding="utf-8"))
parts = [r.get("RCP_PARTS_DTLS", "") for r in rows]
parts = [p for p in parts if p.strip()]

print(f"분석 대상: {len(parts)}건\n")

# ── 1. 조리 단계 수가 정말 최대 6인가 ─────────────────────
step_counter = Counter(
    sum(1 for i in range(1, 21) if str(r.get(f"MANUAL{i:02d}", "")).strip())
    for r in rows
)
print("[조리 단계 수 분포]")
for n in sorted(step_counter):
    print(f"  {n}단계: {step_counter[n]}건")
present = [i for i in range(1, 21)
           if any(str(r.get(f"MANUAL{i:02d}", "")).strip() for r in rows)]
print(f"  실제로 값이 존재하는 MANUAL 필드: {present}\n")

# ── 2. 줄바꿈·섹션 마커 ──────────────────────────────────
print("[구조 신호]")
print(f"  줄바꿈 포함: {sum(1 for p in parts if chr(10) in p)}건")
for marker, label in [("●", "● 섹션"), ("·", "· 섹션"), ("[", "[대괄호]"),
                      ("※", "※ 비고"), ("*", "* 별표")]:
    print(f"  {label} 포함: {sum(1 for p in parts if marker in p)}건")
print(f"  '양념' 문구 포함: {sum(1 for p in parts if '양념' in p)}건")
print(f"  콜론(:) 포함: {sum(1 for p in parts if ':' in p)}건\n")

# ── 3. 첫 줄이 요리명 반복인가 ───────────────────────────
same_first = 0
for r in rows:
    p = r.get("RCP_PARTS_DTLS", "")
    if not p.strip():
        continue
    first = p.split(chr(10))[0].strip()
    name_squeezed = r.get("RCP_NM", "").replace(" ", "")
    if first.replace(" ", "").strip("●·[]:") == name_squeezed:
        same_first += 1
print(f"[첫 줄이 요리명과 동일: {same_first}건 ({same_first/len(parts)*100:.1f}%)]\n")

# ── 4. 항목 분해 시도 — 쉼표 기준 ────────────────────────
def split_items(text: str) -> list[str]:
    text = re.sub(r"[●·※]", chr(10), text)
    items = []
    for line in text.split(chr(10)):
        line = line.strip()
        if not line:
            continue
        if ":" in line:                      # "양념장 : 간장 5g, ..." → 뒤쪽만
            line = line.split(":", 1)[1]
        items += [c.strip() for c in line.split(",") if c.strip()]
    return items

all_items = [it for p in parts for it in split_items(p)]
counts = [len(split_items(p)) for p in parts]
print(f"[쉼표 분해 결과] 총 {len(all_items)}개 항목, "
      f"레시피당 평균 {sum(counts)/len(counts):.1f}개 "
      f"(최소 {min(counts)} / 최대 {max(counts)})\n")

# ── 5. 수량·단위 추출 가능성 ─────────────────────────────
QTY = re.compile(r"([\d./⅓⅔¼½¾]+)\s*(g|kg|ml|L|개|장|줄기|모|마리|쪽|컵|큰술|작은술|스푼|봉지|캔|알|톨|자밤|꼬집|약간|적당량)")
matched = [it for it in all_items if QTY.search(it)]
print(f"[수량·단위 인식] {len(matched)}/{len(all_items)} "
      f"({len(matched)/len(all_items)*100:.1f}%)\n")

unit_counter = Counter(m.group(2) for it in all_items for m in [QTY.search(it)] if m)
print("[단위 빈도 상위 15]")
for u, c in unit_counter.most_common(15):
    print(f"  {u}: {c}")

print("\n[수량·단위를 못 찾은 항목 20개]")
for it in [it for it in all_items if not QTY.search(it)][:20]:
    print(f"  {it[:50]}")

# ── 6. 재료명 후보 빈도 (수량 앞부분) ────────────────────
names = []
for it in all_items:
    m = QTY.search(it)
    name = (it[: m.start()] if m else it).strip(" ·●[]()")
    name = re.sub(r"^\d+\.\s*", "", name)
    if name:
        names.append(name)
print(f"\n[재료명 후보] 고유 {len(set(names))}개 / 전체 {len(names)}개")
print("상위 30개:")
for n, c in Counter(names).most_common(30):
    print(f"  {n}: {c}")
