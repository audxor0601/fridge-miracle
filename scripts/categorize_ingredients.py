#!/usr/bin/env python3
"""
재료 카테고리 분류 — ingredients.category 채우기

참고: hye1ns/datanalysis_recipe (만개의레시피 분석 프로젝트)의 '재료별' 분류 체계.
그쪽은 13종 카테고리를 원핫 인코딩해 KMeans 클러스터링에 썼다. 우리는 목적이 달라서
카테고리 자체만 가져오고, 용도는 '대체 재료 판정'이다.
  레시피가 '돼지고기'를 요구하고 냉장고에 '대패삼겹살'이 있으면 만들 수 있다.

판정은 접미사로만 한다. 키워드 포함으로 하면 감자→과일(감), 김치→해조(김),
고추장→채소(고추), 돼지호박→돼지고기가 된다. 실제로 겪고 바꿨다.

사용법:
    python3 scripts/categorize_ingredients.py            # 미리보기
    python3 scripts/categorize_ingredients.py --apply    # 적용
"""

import json
import sys
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APPLY = "--apply" in sys.argv

SUFFIX_RULES: list[tuple[str, list[str]]] = [
    ("돼지고기", ["돼지고기","삼겹살","목살","목심","앞다리살","뒷다리살","돼지등심","돼지안심",
                "항정살","갈매기살","돼지갈비","베이컨","소시지","햄","등갈비","족발","통삼겹"]),
    ("소고기",   ["소고기","쇠고기","우둔살","채끝","차돌박이","양지","살치살","홍두깨살",
                "부채살","불고기용","우육","갈비","소불고기"]),
    ("닭고기",   ["닭","닭고기","닭가슴살","닭다리","닭다리살","닭고기살","닭봉","닭안심",
                "오리고기","오리"]),
    ("해물류",   ["새우","새우살","오징어","낙지","문어","쭈꾸미","주꾸미","조개","바지락","홍합",
                "굴","꽃게","게","전복","멸치","고등어","갈치","연어","참치","황태","북어","명태",
                "동태","대구","광어","우럭","가자미","조기","꽁치","삼치","아귀","해삼","소라",
                "우렁이","꼬막","가리비","관자","장어","도미","맛살","어묵","코다리","진미채",
                "명란젓","날치알","생선살","흰살생선","새우젓"]),
    ("건어물·해조", ["다시마","미역","김","파래","톳","매생이","한천","가쓰오부시","가다랑어포","디포리"]),
    ("달걀·유제품", ["달걀","계란","노른자","흰자","우유","치즈","버터","생크림","요거트",
                  "요구르트","연유","크림","분유","메추리알"]),
    ("두부·콩",  ["두부","비지","유부","두유","콩","낫토","콩가루"]),
    ("버섯류",   ["버섯","송이","목이","팽이"]),
    ("곡류·면",  ["쌀","쌀가루","현미","보리","찹쌀","찹쌀가루","밀가루","전분","녹말","녹말가루",
                "국수","면","당면","파스타","스파게티","떡","빵","오트밀","귀리","강력분","박력분",
                "중력분","빵가루","부침가루","튀김가루","밥","누룽지","잡곡","흑미","백미","만두피",
                "라이스페이퍼","또띠아","아몬드가루","미숫가루"]),
    ("과일류",   ["사과","배","포도","딸기","바나나","오렌지","레몬","라임","귤","한라봉","자두",
                "복숭아","체리","키위","망고","파인애플","수박","참외","멜론","블루베리","석류",
                "무화과","단감","곶감","대추","밤","매실","살구","자몽","아보카도","코코넛",
                "크랜베리","건포도","홍시","황도","유자","오미자","복분자","주스"]),
    ("양념·조미", ["소금","설탕","간장","식초","참기름","들기름","식용유","올리브유","올리브오일",
                "후추","후춧가루","고춧가루","고추장","된장","쌈장","맛술","청주","미림","물엿",
                "요리당","올리고당","꿀","통깨","참깨","깨","깨소금","액젓","굴소스","케첩",
                "마요네즈","머스터드","겨자","와사비","카레가루","시럽","소스","페스토","젓갈",
                "청국장","두반장","해선장","육수","물","이스트","베이킹소다","베이킹파우더",
                "젤라틴","가루","즙","청","기름","와인","정종"]),
    ("채소류",   ["양파","대파","쪽파","실파","파","마늘","생강","고추","피망","파프리카","당근",
                "감자","고구마","무","배추","양배추","상추","깻잎","시금치","부추","미나리","쑥갓",
                "아욱","근대","케일","브로콜리","브로컬리","콜리플라워","오이","호박","가지","토마토",
                "셀러리","샐러리","연근","우엉","도라지","더덕","토란","죽순","콩나물","숙주","달래",
                "냉이","취나물","고사리","시래기","얼갈이","열무","청경채","비트","치커리","로메인",
                "양상추","올리브","옥수수","완두","나물","잎","채소","새싹","김치","묵은지","깍두기",
                "동치미","단무지","피클","아스파라거스","무순","인삼","수삼","마"]),
    ("견과·기타", ["호두","잣","땅콩","아몬드","캐슈넛","해바라기씨","호박씨","피칸","피스타치오",
                "은행","견과류","묵","곤약","팥","앙금","초콜릿","코코아"]),
]


def classify(name: str) -> str:
    """가장 긴 접미사가 이긴다. '닭다리살'은 '살'보다 '닭다리살'이 우선."""
    best, best_len = "기타", 0
    for cat, keys in SUFFIX_RULES:
        for k in keys:
            if name.endswith(k) and len(k) > best_len:
                best, best_len = cat, len(k)
    return best


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
        f"{URL}/rest/v1/{path}", method=method,
        data=json.dumps(body, ensure_ascii=False).encode() if body is not None else None,
        headers={**HEAD, "Prefer": prefer})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            raw = res.read().decode()
            return json.loads(raw) if raw.strip() else []
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} 실패 ({e.code})\n{e.read().decode()[:400]}")


def main() -> None:
    rows, offset = [], 0
    while True:
        page = call("GET", f"ingredients?select=id,name,category,is_seasoning&limit=1000&offset={offset}&order=id",
                    prefer="count=none")
        if not page:
            break
        rows += page
        offset += 1000

    planned = {r["id"]: classify(r["name"]) for r in rows}
    changed = [r for r in rows if r["category"] != planned[r["id"]]]

    print(f"재료 {len(rows)}개")
    print("\n[분류 결과]")
    for cat, n in Counter(planned.values()).most_common():
        print(f"  {cat}: {n}개")
    print(f"\n바뀌는 행: {len(changed)}개")

    print("\n[샘플 — 카테고리별 6개]")
    seen: dict[str, list[str]] = {}
    for r in rows:
        c = planned[r["id"]]
        seen.setdefault(c, [])
        if len(seen[c]) < 6:
            seen[c].append(r["name"])
    for c, names in seen.items():
        if c != "기타":
            print(f"  {c}: {', '.join(names)}")

    if not APPLY:
        print("\n미리보기입니다. 적용하려면 --apply 를 붙이세요.")
        return

    print("\n적용 중...")
    for i, r in enumerate(changed, 1):
        call("PATCH", f"ingredients?id=eq.{r['id']}", {"category": planned[r["id"]]})
        if i % 100 == 0:
            print(f"  {i}/{len(changed)}", end="\r", flush=True)
    print(f"  {len(changed)}개 갱신 완료")


if __name__ == "__main__":
    main()
