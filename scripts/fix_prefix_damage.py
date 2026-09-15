#!/usr/bin/env python3
"""
일회성 복구 — 한 글자 수식어 '간'이 단어 경계를 무시해 망가뜨린 이름 4개를 되돌린다.
  '간편 어간장' → '편 어간장' 처럼 첫 글자가 잘려나갔다.
원인과 수정은 clean_ingredients.py 의 PREFIX 처리 참고.
"""
import json, sys, urllib.parse, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPAIR = {
    "편 어간장": "간편 어간장",
    "장양념 저염간장": "간장양념 저염간장",
    "편어간장": "간편어간장",
    "장소스 설탕": "간장소스 설탕",
}

def env(k: str) -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith(f"{k}="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit(f".env 에 {k} 없음")

URL, KEY = env("SUPABASE_URL").rstrip("/"), env("SUPABASE_SERVICE_ROLE_KEY")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

def call(method, path, body=None, prefer="return=representation"):
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}", method=method,
        data=json.dumps(body, ensure_ascii=False).encode() if body else None,
        headers={**H, "Prefer": prefer})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw.strip() else []
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} 실패 ({e.code})\n{e.read().decode()[:300]}")

fixed = 0
for broken, original in REPAIR.items():
    rows = call("GET", f"ingredients?select=id,name&name=eq.{urllib.parse.quote(broken)}")
    if not rows:
        print(f"  건너뜀 (없음): {broken}")
        continue
    call("PATCH", f"ingredients?id=eq.{rows[0]['id']}", {"name": original})
    print(f"  복구: {broken!r} → {original!r}")
    fixed += 1
print(f"\n{fixed}건 복구 완료")
