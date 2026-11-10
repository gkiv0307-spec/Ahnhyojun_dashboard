#!/usr/bin/env python3
"""네이버 웹문서 검색을 직접 불러 `제목<TAB>설명` TSV 로 쓴다 — PlayMCP 대신.

PlayMCP 의 '네이버 검색 mcp' 가 2026-09-26 부터 "MCP 상태가 변경되어 이용이 잠시
중단" 상태다. 네이버 개발자센터는 2026-07-31 부터 검색 API 신규 발급을 끝냈고,
새 키는 네이버 클라우드 NAVER API HUB 에서만 나온다. 이 스크립트는 둘 다 받는다.

  키 (환경변수 — 값은 절대 찍지 않는다)
    NAVER_APIHUB_KEY_ID / NAVER_APIHUB_KEY     NAVER API HUB (우선)
    NAVER_CLIENT_ID / NAVER_CLIENT_SECRET      예전 개발자센터 키 (2027-06-30 까지)

  사용
    scripts/naver_search.py --check                         # 키가 보이는지만
    scripts/naver_search.py out.tsv -q "검색어" [-q ...] [--display 30] [--start 31] [--sort date]
    scripts/naver_search.py out.tsv --file queries.txt      # 한 줄에 검색어 하나
    scripts/naver_search.py idx.tsv --idx                   # data/idx-targets.json 의 검색어(display=5)

출력은 MCP 결과를 extract_naver.py 로 뽑은 것과 같은 꼴이다 — `<b>` 태그를 그대로
두고, 탭·줄바꿈만 공백으로 바꾼다. 그래서 뒤 단계(index_recheck.py, 발굴 파서)는
그대로 쓴다. 검색어는 바꾸지 않는다. 결과 TSV 는 커밋하지 마라(실명이 섞일 수 있다).
"""
import argparse, json, os, sys, time, urllib.parse, urllib.request

HUB = 'https://naverapihub.apigw.ntruss.com/search/v1/webkr'
DEV = 'https://openapi.naver.com/v1/search/webkr.json'


def creds():
    """쓸 수 있는 (이름, 주소, 헤더) 후보를 순서대로 돌려준다.

    API HUB 키를 NAVER_CLIENT_ID/SECRET 이름으로 넣는 경우가 있다(2026-09-28 실제로 그랬다).
    그래서 어느 이름으로 들어왔든 API HUB 주소를 먼저 시도하고, 안 되면 개발자센터로 간다."""
    pairs = []
    for i, s_ in (('NAVER_APIHUB_KEY_ID', 'NAVER_APIHUB_KEY'), ('NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET')):
        if os.environ.get(i) and os.environ.get(s_):
            pairs.append((os.environ[i], os.environ[s_]))
    out = []
    for kid, key in pairs:
        out.append(('NAVER API HUB', HUB, {'X-NCP-APIGW-API-KEY-ID': kid, 'X-NCP-APIGW-API-KEY': key}))
        out.append(('개발자센터', DEV, {'X-Naver-Client-Id': kid, 'X-Naver-Client-Secret': key}))
    return out


class AuthError(Exception):
    pass


def search(url, headers, q, display, start, sort='sim'):
    qs = urllib.parse.urlencode({'query': q, 'display': display, 'start': start, 'sort': sort})
    req = urllib.request.Request(f'{url}?{qs}', headers=headers)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            # 429(초당 한도)만 쉬었다 다시. 401·403 은 키 문제라 바로 멈춘다.
            if e.code == 429 and attempt < 2:
                time.sleep(2 * (attempt + 1)); continue
            if e.code in (401, 403):
                raise AuthError(e.read()[:200].decode('utf-8', 'replace'))
            raise SystemExit(f'  ✗ HTTP {e.code} — {q[:40]}… ({e.read()[:200].decode("utf-8", "replace")})')
        except OSError as e:
            if attempt < 2:
                time.sleep(2); continue
            raise SystemExit(f'  ✗ 연결 실패 — {e}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out', nargs='?')
    ap.add_argument('-q', action='append', default=[])
    ap.add_argument('--file')
    ap.add_argument('--idx', action='store_true', help='data/idx-targets.json 의 검색어')
    ap.add_argument('--display', type=int)
    ap.add_argument('--start', type=int, default=1)
    ap.add_argument('--sort', choices=('sim', 'date'), default='sim', help='전지역 신규 시군구는 date')
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()

    cands = creds()
    if not cands:
        if a.check:
            print('  네이버 검색 키: 없음 (NAVER_APIHUB_KEY_ID/NAVER_APIHUB_KEY)')
            return
        raise SystemExit('  네이버 검색 키 없음 — 환경변수 NAVER_APIHUB_KEY_ID / NAVER_APIHUB_KEY')
    # 어느 주소에 맞는 키인지 한 번 불러 보고 고른다(값은 찍지 않는다).
    errs = []
    for name, url, headers in cands:
        try:
            search(url, headers, '법원경매', 1, 1)
            break
        except AuthError as e:
            errs.append(f'{name}: {e}')
    else:
        raise SystemExit('  ✗ 네이버 검색 인증 실패 — ' + ' / '.join(errs))
    if a.check:
        print(f'  네이버 검색 키: {name} (인증 확인)')
        return
    if not a.out:
        ap.error('출력 파일을 지정하라')

    qs = list(a.q)
    if a.file:
        qs += [l.strip() for l in open(a.file, encoding='utf-8') if l.strip()]
    display = a.display
    if a.idx:
        t = json.load(open('data/idx-targets.json', encoding='utf-8'))
        qs += [it.get('query') or t['query'].format(caNo=it['caNo']) for it in t['items']]
        display = display or 5
    display = display or 30
    if not qs:
        ap.error('검색어가 없다')

    rows, seen, n_items = [], set(), 0
    for i, q in enumerate(qs):
        o = search(url, headers, q, display, a.start, a.sort)
        items = o.get('items') or []
        n_items += len(items)
        for it in items:
            t = (it.get('title') or '').replace('\t', ' ').replace('\n', ' ')
            d = (it.get('description') or '').replace('\t', ' ').replace('\n', ' ')
            if t and (t, d) not in seen:
                seen.add((t, d)); rows.append(f'{t}\t{d}')
        if i + 1 < len(qs):
            time.sleep(0.15)   # 초당 10회 한도 아래로
    with open(a.out, 'w', encoding='utf-8') as f:
        f.write('\n'.join(rows) + ('\n' if rows else ''))
    print(f'  {name} · 검색 {len(qs)}회 · 결과 {n_items}건 → 중복 뺀 {len(rows)}줄 · {a.out}')


if __name__ == '__main__':
    main()
