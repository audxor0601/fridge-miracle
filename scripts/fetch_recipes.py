#!/usr/bin/env python3
"""
식약처 조리식품 레시피 DB(COOKRCP01) 수집 스크립트

Step 2 — 원본 수집. 가공은 하지 않는다. 받은 그대로 저장하고,
몇 건을 받았는지 / 어떤 필드가 얼마나 비어 있는지만 보고한다.

사용법:
    cd ~/projects/fridge-miracle
    echo 'FOODSAFETY_API_KEY=발급받은키' > .env
    python3 scripts/fetch_recipes.py

출력:
    data/raw/cookrcp01.json   원본 (가공 전)
    data/raw/report.md        수집 건수 · 결측률 리포트
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

API_HOST = "http://openapi.foodsafetykorea.go.kr/api"
SERVICE = "COOKRCP01"
CHUNK = 1000          # API가 한 번에 허용하는 최대 건수
TIMEOUT = 30
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "raw"

# 결측률을 확인할 필드 (설계서 3장 recipes 테이블 매핑 기준)
CHECK_FIELDS = [
    "RCP_SEQ", "RCP_NM", "RCP_WAY2", "RCP_PAT2",
    "INFO_ENG", "INFO_CAR", "INFO_PRO", "INFO_FAT", "INFO_NA",
    "RCP_PARTS_DTLS", "ATT_FILE_NO_MK", "HASH_TAG", "MANUAL01",
]


def load_key() -> str:
    key = os.environ.get("FOODSAFETY_API_KEY")
    if key:
        return key.strip()

    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("FOODSAFETY_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")

    sys.exit(
        "인증키를 찾을 수 없습니다.\n"
        "  프로젝트 루트에 .env 파일을 만들고 아래 한 줄을 넣으세요:\n"
        "  FOODSAFETY_API_KEY=발급받은키"
    )


def fetch(key: str, start: int, end: int) -> dict:
    url = f"{API_HOST}/{key}/{SERVICE}/json/{start}/{end}"
    req = urllib.request.Request(url, headers={"User-Agent": "fridge-miracle/0.1"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
        return json.loads(res.read().decode("utf-8"))


def unwrap(payload: dict) -> tuple[list, int, str]:
    """{'COOKRCP01': {'RESULT': {...}, 'total_count': '...', 'row': [...]}} 구조를 푼다."""
    body = payload.get(SERVICE)
    if body is None:
        raise RuntimeError(f"예상과 다른 응답입니다: {list(payload.keys())}")

    result = body.get("RESULT", {})
    code = result.get("CODE", "")
    msg = result.get("MSG", "")
    if code and not code.startswith("INFO-000"):
        raise RuntimeError(f"API 오류 {code}: {msg}")

    rows = body.get("row", []) or []
    total = int(body.get("total_count", 0) or 0)
    return rows, total, msg


def main() -> None:
    key = load_key()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("전체 건수 확인 중...")
    try:
        _, total, msg = unwrap(fetch(key, 1, 1))
    except urllib.error.URLError as e:
        sys.exit(f"연결 실패: {e}\n네트워크 또는 인증키를 확인하세요.")
    print(f"  총 {total}건 ({msg})")

    if total == 0:
        sys.exit("건수가 0입니다. 인증키가 승인되었는지 확인하세요.")

    rows: list[dict] = []
    for start in range(1, total + 1, CHUNK):
        end = min(start + CHUNK - 1, total)
        print(f"  {start:>5} ~ {end:>5} 요청...", end=" ", flush=True)
        chunk, _, _ = unwrap(fetch(key, start, end))
        rows.extend(chunk)
        print(f"{len(chunk)}건")
        time.sleep(0.3)          # 공공 API에 대한 예의

    raw_path = OUT_DIR / "cookrcp01.json"
    raw_path.write_text(
        json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    # ── 검증 리포트 ─────────────────────────────────────────
    seq_values = [r.get("RCP_SEQ") for r in rows]
    dup = len(seq_values) - len(set(seq_values))

    lines = [
        "# COOKRCP01 수집 리포트",
        "",
        f"- API가 보고한 전체 건수: **{total}**",
        f"- 실제 수집 건수: **{len(rows)}**",
        f"- RCP_SEQ 중복: **{dup}건**",
        f"- 원본 파일 크기: **{raw_path.stat().st_size / 1024 / 1024:.2f} MB**",
        "",
        "## 필드별 결측률",
        "",
        "| 필드 | 비어 있음 | 결측률 |",
        "|---|---:|---:|",
    ]
    for f in CHECK_FIELDS:
        missing = sum(1 for r in rows if not str(r.get(f, "")).strip())
        lines.append(f"| {f} | {missing} | {missing / len(rows) * 100:.1f}% |")

    # 조리 단계 개수 분포
    step_counts = [
        sum(1 for i in range(1, 21) if str(r.get(f"MANUAL{i:02d}", "")).strip())
        for r in rows
    ]
    no_steps = sum(1 for c in step_counts if c == 0)
    lines += [
        "",
        "## 조리 단계",
        "",
        f"- 평균 단계 수: **{sum(step_counts) / len(step_counts):.1f}**",
        f"- 최대 단계 수: **{max(step_counts)}**",
        f"- 단계가 아예 없는 레시피: **{no_steps}건**",
        "",
        "## 재료 원문 샘플 (Step 3 파싱 대상)",
        "",
    ]
    for r in rows[:3]:
        lines.append(f"- **{r.get('RCP_NM')}**: `{r.get('RCP_PARTS_DTLS', '')[:120]}`")

    report_path = OUT_DIR / "report.md"
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print()
    print("\n".join(lines[:8]))
    print(f"\n저장 완료: {raw_path}")
    print(f"리포트:    {report_path}")


if __name__ == "__main__":
    main()
