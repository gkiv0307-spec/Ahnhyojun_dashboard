#!/usr/bin/env python3
"""법정동코드 표를 건축물대장 API 로 역탐색해 만든다.

법정동코드 전체자료는 code.go.kr 로그인이나 별도 활용신청이 필요하다.
그런데 건축물대장은 `sigunguCd + bjdongCd` 만으로 조회되고 응답의 `platPlc` 에
주소가 그대로 들어 있다. 코드를 넣어 보고 돌아온 주소를 읽으면 표가 만들어진다.

코드 뒤 5자리 = 읍면동(3) + 리(2).
  · 동 지역: 101xx ~ 1xxxx, 리 자리는 00
  · 읍: 25x~26x / 면: 31x~33x, **리가 따로 있어 뒤 2자리를 훑어야 한다**
    (실측: 달성군 화원읍 250 · 논공읍 253 · 다사읍 256 · 유가읍 259 ·
     옥포읍 262 · 현풍읍 265 · 가창면 310 · 하빈면 330)
  · 리=00 이나 01 로는 대부분 안 잡힌다. 21·31 부터 시작하는 곳이 많다.

  scripts/bjdong_discover.py 27710 --from 25000 --to 26599
"""
import argparse, json, os, re, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = 'https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo'
OUT = 'data/bjdong.json'
KEY = open(os.path.expanduser('~/.secrets/datagokr-bld')).read().strip()


def probe(sgg, bjd):
    url = (f'{BASE}?serviceKey={urllib.parse.quote(KEY, safe="")}'
           f'&sigunguCd={sgg}&bjdongCd={bjd:05d}&numOfRows=1&_type=json')
    for _ in range(3):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                body = json.loads(r.read())['response']['body']
            break
        except Exception:
            continue
    else:
        return None
    it = (body.get('items') or {}).get('item') if isinstance(body.get('items'), dict) else None
    if not it:
        return None
    x = it[0] if isinstance(it, list) else it
    # "대구광역시 달성군 다사읍 서재리 169번지" → 4토막까지 받는다
    t = re.sub(r'\d.*$', '', (x.get('platPlc') or '')).split()
    if len(t) < 3:
        return None
    return {'sgg': str(sgg), 'bjd': f'{bjd:05d}', 'sido': t[0], 'gu': t[1],
            'emd': t[2], 'ri': t[3] if len(t) > 3 else None}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sgg', nargs='+')
    ap.add_argument('--from', dest='lo', type=int, default=10100)
    ap.add_argument('--to', dest='hi', type=int, default=14500)
    ap.add_argument('--step', type=int, default=100)
    ap.add_argument('--par', type=int, default=12)
    a = ap.parse_args()

    table = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
    codes = list(range(a.lo, a.hi + 1, a.step))
    added = 0
    for sgg in a.sgg:
        with ThreadPoolExecutor(a.par) as ex:
            for r in ex.map(lambda c: probe(sgg, c), codes):
                if not r:
                    continue
                # 구 이름은 시·도를 넘어 겹친다(중·동·서·남·북구가 대구에도
                # 부산에도 있다). 시·도를 키에 넣지 않으면 나중에 들어온
                # 시·도가 앞의 것을 덮어써 엉뚱한 코드가 된다.
                key = f"{r['sido']}|{r['gu']}|{r['emd']}" + (f"|{r['ri']}" if r['ri'] else '')
                if key not in table:
                    added += 1
                table[key] = {'sgg': r['sgg'], 'bjd': r['bjd'], 'sido': r['sido']}
        print(f'  {sgg} 완료 (누적 {len(table)})', file=sys.stderr)

    json.dump(table, open(OUT, 'w', encoding='utf-8'),
              ensure_ascii=False, indent=0, sort_keys=True)
    print(f'법정동 {len(table)}개 (신규 {added})')


if __name__ == '__main__':
    main()
