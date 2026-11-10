#!/usr/bin/env python3
"""국토부 실거래가(아파트 매매·전월세)를 모아 data/rtms.json 을 만든다.

  scripts/fetch_rtms.py [--months 12] [--out data/rtms.json]

왜 지번으로 묶나
    단지명 매칭은 못 믿는다. 경매 주소는 '북구 태전동 608-5 4동 14층1402호'
    처럼 단지명이 아예 없는 경우가 흔하고, 있어도 표기가 갈린다
    ('삼성아파트' / '태전삼성' / '삼성타운').
    실거래가 API 는 umdNm(법정동) + jibun(지번) 을 준다. 이건 주소에서
    그대로 뽑히므로 (법정동, 지번) 을 1차 키로 쓴다. 단지명은 보조 키다.

주의
    - cdealType == 'O' 는 **해제된 거래**다. 빼지 않으면 없던 거래가 시세로 잡힌다.
    - 금액은 만원 단위 문자열에 천단위 쉼표가 박혀 온다('65,500').
    - monthlyRent 가 0 또는 공란이면 전세다.
    - 응답이 XML 뿐이다. JSON 포맷은 제공되지 않는다.
"""
import argparse, concurrent.futures as cf, json, os, pathlib, subprocess, sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent
SH = ROOT / 'scripts' / 'datagokr.sh'

# 게시판에 아파트 물건이 실제로 있는 시군구만 받는다. 아파트가 거의 없는
# 군까지 넣으면 콜 수만 늘고 붙는 시세는 없다.
SGG = {
    # 대구 전역 + 경북 인접
    '27110': '중구', '27140': '동구', '27170': '서구', '27200': '남구',
    '27230': '북구', '27260': '수성구', '27290': '달서구', '27710': '달성군',
    '47290': '경산시', '47850': '칠곡군', '47230': '영천시', '47130': '경주시',
    # 부산 전역
    '26110': '중구', '26140': '서구', '26170': '동구', '26200': '영도구',
    '26230': '부산진구', '26260': '동래구', '26290': '남구', '26320': '북구',
    '26350': '해운대구', '26380': '사하구', '26410': '금정구', '26440': '강서구',
    '26470': '연제구', '26500': '수영구', '26530': '사상구', '26710': '기장군',
    # 경남 — 아파트 물량이 있는 시와 창녕·하동
    '48121': '의창구', '48123': '성산구', '48125': '마산합포구',
    '48127': '마산회원구', '48129': '진해구',
    '48170': '진주시', '48220': '통영시', '48240': '사천시', '48250': '김해시',
    '48270': '밀양시', '48310': '거제시', '48330': '양산시',
    '48740': '창녕군', '48850': '하동군',
}

# 구 이름은 시·도를 넘어 겹친다 — 대구 남구와 부산 남구, 대구 북구와 부산
# 북구가 그렇다. 구 이름만으로 맞추면 대구 단지 시세가 부산 물건에 붙는다.
# 법정동코드 앞 두 자리로 시·도를 같이 실어 두고, attach_rtms 가 대조한다.
SIDO = {'26': '부산', '27': '대구', '47': '경북', '48': '경남'}


def months_back(n):
    y, m = date.today().year, date.today().month
    out = []
    for _ in range(n):
        out.append(f'{y}{m:02d}')
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return sorted(out)


def call(fn, lawd, ym):
    """datagokr.sh 의 함수를 그대로 쓴다. 인증키 해석을 두 곳에 두지 않는다."""
    r = subprocess.run(
        ['bash', '-c', f'set +u; source "{SH}"; {fn} {lawd} {ym} 1000'],
        capture_output=True, text=True, timeout=180)
    return r.stdout if r.returncode == 0 else ''


def rows(xml, kind):
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return
    for it in root.iter('item'):
        g = lambda t: (it.findtext(t) or '').strip()
        if g('cdealType') == 'O':          # 해제된 거래
            continue
        try:
            ar = float(g('excluUseAr'))
        except ValueError:
            continue
        umd, jib, nm = g('umdNm'), g('jibun'), g('aptNm')
        if not (umd and jib and nm):
            continue
        y, mo, dd = g('dealYear'), g('dealMonth'), g('dealDay')
        if not y:
            continue
        d = f'{y}-{int(mo or 0):02d}-{int(dd or 0):02d}'
        num = lambda t: int((g(t) or '0').replace(',', '') or 0)
        base = dict(umd=umd, jib=jib, nm=nm, ar=ar, d=d,
                    fl=g('floor'), yr=g('buildYear'))
        if kind == 'trade':
            amt = num('dealAmount')
            if amt:
                yield {**base, 'amt': amt}
        else:
            yield {**base, 'dep': num('deposit'), 'rent': num('monthlyRent')}


def med(v):
    v = sorted(v)
    n = len(v)
    return v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) // 2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--months', type=int, default=12)
    ap.add_argument('--jobs', type=int, default=6,
                    help='동시에 보낼 요청 수. data.go.kr 은 하루 10,000콜을 준다.')
    ap.add_argument('--out', default=str(ROOT / 'data' / 'rtms.json'))
    a = ap.parse_args()

    yms = months_back(a.months)
    print(f'{len(SGG)}개 시군구 × {len(yms)}개월 × 2종 = {len(SGG)*len(yms)*2}콜',
          file=sys.stderr)

    T = defaultdict(list)   # (umd,jib,arbucket) -> 매매
    R = defaultdict(list)   # (umd,jib,arbucket) -> 전월세
    meta = {}               # (umd,jib) -> {nm,gu,sd,yr}
    nt = nr = 0

    # 42개 시군구를 한 줄로 돌리면 콜당 몇 초씩 걸려 한 시간을 넘긴다.
    # 받아 오는 일만 병렬로 돌리고, 파싱과 집계는 한 곳에서 순서대로 한다 —
    # defaultdict 를 여러 스레드가 같이 만지면 조용히 어긋난다.
    jobs = [(lawd, gu, ym, kind, fn)
            for lawd, gu in SGG.items()
            for ym in yms
            for kind, fn in (('trade', 'apt_trade'), ('rent', 'apt_rent'))]
    done = 0
    per_gu = defaultdict(lambda: [0, 0])
    with cf.ThreadPoolExecutor(max_workers=a.jobs) as ex:
        fut = {ex.submit(call, j[4], j[0], j[2]): j for j in jobs}
        for f in cf.as_completed(fut):
            lawd, gu, ym, kind, _ = fut[f]
            try:
                xml = f.result()
            except Exception:
                xml = ''
            for r in rows(xml, kind):
                key = (r['umd'], r['jib'])
                meta.setdefault(key, {'nm': r['nm'], 'gu': gu, 'yr': r['yr'],
                                      'r': SIDO[lawd[:2]]})
                (T if kind == 'trade' else R)[key + (int(round(r['ar'])),)].append(r)
                per_gu[lawd][0 if kind == 'trade' else 1] += 1
            done += 1
            if done % 100 == 0:
                print(f'  {done}/{len(jobs)}콜', file=sys.stderr, flush=True)

    # 구 이름은 시·도를 넘어 겹친다('남구'가 대구에도 부산에도 있다).
    # 이름으로 세면 두 번 더해진다. 법정동코드로 센다.
    for lawd, gu in SGG.items():
        ct, cr = per_gu[lawd]
        nt += ct; nr += cr
        print(f'  {SIDO[lawd[:2]]} {gu:8} 매매 {ct:>6}  전월세 {cr:>6}', file=sys.stderr)

    sites = {}
    for (umd, jib), m in meta.items():
        sk = f'{umd}|{jib}'
        # 'r' 은 전월세다. 시·도는 'sd' 로 따로 둔다 — 이름을 겹치면 덮인다.
        s = {'nm': m['nm'], 'gu': m['gu'], 'sd': m['r'], 'yr': m['yr'], 't': {}, 'r': {}}
        for ar in {k[2] for k in list(T) + list(R) if k[0] == umd and k[1] == jib}:
            tr = sorted(T.get((umd, jib, ar), []), key=lambda x: x['d'])
            if tr:
                amts = [x['amt'] for x in tr]
                s['t'][str(ar)] = {
                    'n': len(tr), 'med': med(amts), 'min': min(amts), 'max': max(amts),
                    'last': tr[-1]['d'],
                    # 최근 3건만 남긴다. 카드에 보여줄 근거로 충분하고 파일이 안 붓는다.
                    'rows': [[x['d'], x['amt'], x['fl']] for x in tr[-3:]][::-1],
                }
            rt = R.get((umd, jib, ar), [])
            js = [x['dep'] for x in rt if not x['rent']]
            ws = [x for x in rt if x['rent']]
            if js or ws:
                e = {'last': max(x['d'] for x in rt)}
                if js:
                    e['jn'] = len(js); e['jmed'] = med(js)
                if ws:
                    e['wn'] = len(ws)
                    e['wdep'] = med([x['dep'] for x in ws])
                    e['wmed'] = med([x['rent'] for x in ws])
                s['r'][str(ar)] = e
        if s['t'] or s['r']:
            sites[sk] = s

    by_name = defaultdict(list)
    for sk, s in sites.items():
        by_name[f"{s['sd']}|{s['gu']}|{s['nm']}"].append(sk)

    out = {'gen': date.today().isoformat(), 'from': yms[0], 'to': yms[-1],
           'sgg': SGG, 'unit': '만원', 'sites': sites, 'byName': dict(by_name)}
    pathlib.Path(a.out).write_text(
        json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    kb = os.path.getsize(a.out) // 1024
    print(f'\n단지 {len(sites)}곳 · 매매 {nt}건 · 전월세 {nr}건 → {a.out} ({kb}KB)',
          file=sys.stderr)


if __name__ == '__main__':
    main()
