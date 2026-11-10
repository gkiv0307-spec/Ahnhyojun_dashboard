#!/usr/bin/env python3
"""pointauction.co.kr 의 공개 상세 페이지에서 대구권 물건을 담는다.

  python3 scripts/harvest_point.py --sitemap        # 사이트맵을 받아 URL 목록을 만든다
  python3 scripts/harvest_point.py --crawl          # 상세 페이지를 받아 캐시한다
  python3 scripts/harvest_point.py --parse          # 캐시를 파싱해 JSON 으로
  python3 scripts/harvest_point.py --parse --merge  # data.json 에 합친다

**robots.txt 를 지킨다.** 그 사이트는 `/api/` `/admin/` `/private/` `/reference/`
를 막고 나머지를 허용한다. 사람들이 흔히 보는 `/data/?lot=...` 는 자바스크립트
껍데기라 값이 `/api/` 에서 온다 — **거기는 건드리지 마라.** 같은 물건의
`/lots/...` 페이지가 서버에서 완성된 HTML 로 나오고 사이트맵에도 올라와 있다.
그쪽만 쓴다. 요청 간격은 0.45초로 둔다.

**이 사이트는 법원 원본이 아니다.** 스스로 원천 우선순위를
'대법원경매 > J-Auction > 두인경매' 라고 밝히는 2차 집계다. 나이스옥션 색인과
같은 등급으로 다룬다 — `verified` 는 false 로 두고 CODEF 대조 큐로 넘긴다.

**갱신이 늦다.** 2026-09-03 에 보드와 물건 단위로 118건을 대조했더니
감정가 76/78, 기일 42/46, 최저가 37/45 만 일치했다. 어긋난 건 전부 이쪽이
옛날 값이었다(저감이 덜 된 최저가, 지나간 기일). 페이지에 '원천 자료 갱신'
날짜가 찍혀 있는데 7월인 것도 많다. **그래서 진행상태를 올리지 않고
'미확인' 으로 담는다.** 금액도 보드에 이미 있으면 덮지 않는다.

대신 이 출처에만 있는 게 둘 있다.
  · 말소기준권리 — 1,245건 중 1,070건. 다른 어느 출처에도 없다.
  · 기일 사다리 — 회차·최저가·결과가 표로 있어 유찰 횟수를 정확히 센다.
"""
import argparse, hashlib, html, json, os, pathlib, re, sys, time, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
CACHE = pathlib.Path(os.environ.get('POINT_CACHE', '/tmp/point'))
BASE = 'https://pointauction.co.kr'
UA = {'User-Agent': 'Mozilla/5.0 (compatible; auction-board/1.0)'}
DELAY = 0.45

# 사이트맵 URL 의 법원 코드. 표본으로 한 건씩 열어 확인했다.
COURTS = {'B000310': '대구지방법원', 'B000320': '대구서부지원'}


def get(url, timeout=30):
    return urllib.request.urlopen(
        urllib.request.Request(url, headers=UA), timeout=timeout).read()


def cmd_sitemap():
    CACHE.mkdir(parents=True, exist_ok=True)
    idx = get(f'{BASE}/sitemap.xml').decode('utf-8', 'replace')
    maps = re.findall(r'<loc>([^<]*lots-\d+\.xml)</loc>', idx)
    urls = []
    for m in maps:
        try:
            urls += re.findall(r'<loc>([^<]+)</loc>', get(m).decode('utf-8', 'replace'))
        except Exception as e:
            print(f'  사이트맵 실패 {m}: {e}', file=sys.stderr)
        time.sleep(DELAY)
    dg = [u for u in urls
          if re.search(r'/lots/(' + '|'.join(COURTS) + ')-', u)
          and re.search(r'-(2025|2026)타경', urllib.parse.unquote(u))]
    (CACHE / 'urls.json').write_text(json.dumps(sorted(dg)), encoding='utf-8')
    print(f'사이트맵 {len(maps)}개 · 전체 {len(urls)} · 대구권 2025~2026 {len(dg)}', file=sys.stderr)


def cmd_crawl():
    urls = json.loads((CACHE / 'urls.json').read_text(encoding='utf-8'))
    d = CACHE / 'html'; d.mkdir(parents=True, exist_ok=True)
    ok = skip = err = 0
    for i, u in enumerate(urls):
        f = d / (hashlib.md5(u.encode()).hexdigest() + '.html')
        if f.exists():
            skip += 1; continue
        try:
            f.write_bytes(get(u, 25)); ok += 1
        except Exception as e:
            err += 1
            if err <= 5:
                print(f'  실패 {u}: {e}', file=sys.stderr)
        time.sleep(DELAY)
        if (i + 1) % 200 == 0:
            print(f'  {i+1}/{len(urls)} 받음{ok} 건너뜀{skip} 실패{err}', file=sys.stderr)
    print(f'받음 {ok} · 이미 있음 {skip} · 실패 {err}', file=sys.stderr)


def lines(s):
    s = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', s)
    s = html.unescape(re.sub(r'(?s)<[^>]+>', '\n', s))
    return [l.strip() for l in s.split('\n') if l.strip()]


def after(L, key):
    for i, l in enumerate(L):
        if l == key and i + 1 < len(L):
            return L[i + 1]
    return None


def won(s):
    m = re.search(r'([\d,]+)\s*원', s or '')
    return int(m.group(1).replace(',', '')) or None if m else None


def parse_one(path, url):
    L = lines(pathlib.Path(path).read_text(encoding='utf-8', errors='replace'))
    head = next((l for l in L if re.match(r'^\d{4}타경\d+\s', l) and '경매' in l), None)
    if not head:
        return None
    caNo = re.match(r'^(\d{4}타경\d+)', head).group(1)
    meta = next((l for l in L if ' · ' in l and ('지방법원' in l or '지원' in l)), '')
    p = [x.strip() for x in meta.split('·')]
    d = (after(L, '매각기일') or '').replace('.', '-').strip()
    # 기일 사다리: 날짜 / N차 / 금액 / 결과 네 줄이 반복된다
    ld = []
    for i, l in enumerate(L):
        if re.fullmatch(r'\d{4}-\d{2}-\d{2}', l) and i + 3 < len(L) and re.fullmatch(r'\d+차', L[i + 1]):
            ld.append({'d': l, 'n': int(L[i + 1][:-1]), 'mn': won(L[i + 2]), 'r': L[i + 3]})
    ar = None
    for i, l in enumerate(L):
        if l == 'exclusive area sqm' and i + 1 < len(L):
            m = re.match(r'([\d.]+)', L[i + 1])
            if m:
                ar = float(m.group(1)); break
    base = next((L[i + 1] for i, l in enumerate(L)
                 if l == 'priority base right' and i + 1 < len(L)), None)
    m = re.search(r'/lots/B\d+-\d{4}타경\d+-(\d+)', urllib.parse.unquote(url))
    return {
        'caNo': caNo, 'ino': int(m.group(1)) if m else 1,
        'ct': p[0] if p else None, 'ut': p[1] if len(p) > 1 else None,
        'srcSt': p[2] if len(p) > 2 else None,
        'a': after(L, '소재지'), 'ap': won(after(L, '감정가') or ''),
        'mn': won(after(L, '최저매각가격') or ''),
        'd': d if re.fullmatch(r'\d{4}-\d{2}-\d{2}', d) else None,
        'f': sum(1 for e in ld if e['r'] == '유찰') if ld else None,
        'ld': ld, 'pbase': base, 'ar': ar, 'url': url,
    }


# 담을 상태. 끝난 사건은 큐를 축내므로 넣지 않는다.
LIVEISH = {'진행중', '변경', '유찰', 'scheduled'}


def cmd_parse(merge):
    from parse_auction import split_addr
    urls = json.loads((CACHE / 'urls.json').read_text(encoding='utf-8'))
    rows = []
    for u in urls:
        f = CACHE / 'html' / (hashlib.md5(u.encode()).hexdigest() + '.html')
        if not f.exists():
            continue
        r = parse_one(f, u)
        if r:
            rows.append(r)
    print(f'파싱 {len(rows)}건', file=sys.stderr)

    dp = ROOT / 'data' / 'data.json'
    D = json.loads(dp.read_text(encoding='utf-8'))
    have = {(x.get('ct'), x.get('caNo'), x.get('ino') or 1) for x in D}

    new, st = [], {}
    def bump(k): st[k] = st.get(k, 0) + 1
    for r in rows:
        k = (r['ct'], r['caNo'], r['ino'])
        if k in have:
            bump('이미 있음'); continue
        if r['srcSt'] not in LIVEISH:
            bump(f"끝난 사건({r['srcSt']})"); continue
        if r['ut'] != '아파트':
            bump(f"용도 {r['ut']}"); continue
        if not r['a']:
            bump('소재지 없음'); continue
        # 시·도나 시군구가 안 보이면 주소 조각만 온 것이다('(중리동,진달래)').
        # 어느 단지인지 알 수 없어 실거래도 못 붙인다.
        if not re.search(r'(광역시|특별시|[가-힣]+도\s|[가-힣]{2,}[시군구]\s)', r['a']):
            bump('주소 조각'); continue
        # 용도가 '아파트' 로 와도 주소가 상가·오피스텔이면 아파트가 아니다.
        # ('초원장미타운 상가동' 이 아파트로 들어왔다.)
        if re.search(r'상가|오피스텔|근린|도시형생활주택', r['a']):
            bump('주소가 상가·오피스텔'); continue
        a1, a2 = split_addr(r['a'])
        x = {'r': '대구', 'c': r['caNo'], 'ct': r['ct'], 'caNo': r['caNo'], 'ino': r['ino'],
             'a': r['a'], 'a1': a1, 'a2': a2, 'ap': r['ap'], 'mn': r['mn'],
             'ut': '아파트', 'utGuess': False,
             # 출처가 진행상태를 적어 주지만 갱신이 늦다(파일 머리 참고).
             # 올리지 않고 미확인으로 두고 CODEF 가 확정하게 한다.
             'st': '미확인', 'sp': [], 'verified': False, 'src': 'pointauction',
             'f': r['f'], 'ld': r['ld'],
             'note': (f"pointauction 공개 상세 발굴 — 출처 표기 진행상태는 '{r['srcSt']}'"
                      ' 입니다. 이 사이트는 법원 원본이 아니라 2차 집계이고 갱신이'
                      ' 늦어, 진행상태·금액을 그대로 올리지 않았습니다. 법원 원본'
                      ' 대조 전입니다.')}
        if r['ap'] and r['mn']:
            x['rt'] = round(r['mn'] / r['ap'] * 100)
        if r['ar']:
            x['ar'] = r['ar']
        if r['pbase']:
            x['pbase'] = r['pbase']
        new.append(x); have.add(k); bump('채택')

    print(' · '.join(f'{k} {v}' for k, v in sorted(st.items(), key=lambda kv: -kv[1])), file=sys.stderr)
    if not merge:
        json.dump(new, sys.stdout, ensure_ascii=False)
        return
    D.extend(new)
    dp.write_text(json.dumps(D, ensure_ascii=False), encoding='utf-8')
    print(f'data.json {len(D)}건 (신규 {len(new)})', file=sys.stderr)


def main():
    a = argparse.ArgumentParser()
    a.add_argument('--sitemap', action='store_true')
    a.add_argument('--crawl', action='store_true')
    a.add_argument('--parse', action='store_true')
    a.add_argument('--merge', action='store_true')
    a = a.parse_args()
    if a.sitemap: cmd_sitemap()
    if a.crawl: cmd_crawl()
    if a.parse: cmd_parse(a.merge)
    if not (a.sitemap or a.crawl or a.parse):
        print(__doc__)


if __name__ == '__main__':
    main()
