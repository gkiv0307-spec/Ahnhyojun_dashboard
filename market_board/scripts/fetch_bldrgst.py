#!/usr/bin/env python3
"""건축물대장으로 물건의 전용면적·구조·사용승인일을 채운다.

국토교통부_건축HUB_건축물대장정보 (data.go.kr 15134735).
실거래가와 **다른 인증키**를 쓴다 — 계정이 달라 키가 서로 통하지 않는다.
  ~/.secrets/datagokr      실거래가
  ~/.secrets/datagokr-bld  건축물대장

전용면적은 `getBrExposPubuseAreaInfo` 에 동·호를 넘겨야 정확히 나온다.
실거래가로 추정한 면적과 다를 수 있다 — 성서우방유쉘 103동 802호는
실거래 최다 밴드가 84.9㎡ 인데 실제 전유면적은 127.99㎡ 였다.
"""
import json, os, re, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = 'https://apis.data.go.kr/1613000/BldRgstHubService'
KEY = open(os.path.expanduser('~/.secrets/datagokr-bld')).read().strip()
BJD = json.load(open('data/bjdong.json', encoding='utf-8'))

# 구 이름은 시·도를 넘어 겹친다 — 중·동·서·남·북구가 대구에도 부산에도 있다.
# 표를 '시군구|법정동' 으로만 키를 잡으면 부산 물건에 대구 코드가 붙고,
# 그러면 **엉뚱한 건물의 전용면적**을 가져온다. 시·도까지 맞춰 찾는다.
# 보드의 r 은 권역이라 경산·칠곡·영천·경주가 r='대구' 로 들어와 있다.
_SIDO = {'대구': ('대구광역시', '경상북도'), '경북': ('경상북도',),
         '부산': ('부산광역시',), '경남': ('경상남도',),
         '울산': ('울산광역시',), '서울': ('서울특별시',),
         '인천': ('인천광역시',), '대전': ('대전광역시',),
         '광주': ('광주광역시',), '경기': ('경기도',),
         '충북': ('충청북도',), '충남': ('충청남도',),
         '전북': ('전북특별자치도', '전라북도'), '전남': ('전라남도',),
         '강원': ('강원특별자치도', '강원도'), '제주': ('제주특별자치도',)}


def bjd_find(region, a1, emd):
    """(시·도 후보, 시군구, 법정동) → 코드. 못 고르면 None — 추측하지 않는다."""
    sidos = _SIDO.get(region)
    # 표의 키는 토막마다 '|' 로 나뉜다 — '성남시 분당구' 는 '성남시|분당구',
    # '석적읍 남율리' 는 '석적읍|남율리'. 띄어쓰기를 '|' 로 바꿔 맞춘다.
    a1k, emdk = a1.replace(' ', '|'), emd.replace(' ', '|')
    hits = [BJD[f'{sd}|{a1k}|{emdk}'] for sd in (sidos or ())
            if f'{sd}|{a1k}|{emdk}' in BJD]
    if len(hits) == 1:
        return hits[0]
    if sidos:
        return None
    # 권역을 모르면 이름이 온 나라에서 하나뿐일 때만 쓴다.
    allh = [v for k, v in BJD.items() if k.endswith(f'|{a1k}|{emdk}')]
    return allh[0] if len(allh) == 1 else None


def call(op, **p):
    q = '&'.join(f'{k}={urllib.parse.quote(str(v))}' for k, v in p.items())
    url = (f'{BASE}/{op}?serviceKey={urllib.parse.quote(KEY, safe="")}'
           f'&_type=json&{q}')
    for i in range(4):                     # 연결 리셋이 흔하다. 반드시 재시도한다.
        try:
            with urllib.request.urlopen(url, timeout=40) as r:
                body = json.loads(r.read())['response']['body']
            it = (body.get('items') or {}).get('item') if isinstance(body.get('items'), dict) else None
            return it if isinstance(it, list) else ([it] if it else [])
        except Exception:
            time.sleep(1.5 * (i + 1))
    return []


def resolve(x):
    """물건 주소 → (시군구코드, 법정동코드, 번지, 지, 동명, 호명)"""
    a = (x.get('a') or '').strip()
    a1 = x.get('a1')
    if not a1 or '미색인' in a:
        return None
    # 시군구 뒤부터 본다
    body = a.split(a1, 1)[-1].strip() if a1 in a else a
    toks = body.split()
    if not toks:
        return None
    # 읍/면 + 리 조합을 먼저 시도하고, 안 되면 읍면동만
    ent = key = None
    for n in (2, 1):
        if len(toks) >= n:
            emd = ' '.join(toks[:n])
            got = bjd_find(x.get('r'), a1, emd)
            if got:
                ent, key = got, f'{a1}|{emd}'
                toks = toks[n:]
                break
    if not ent:
        return None
    # 남은 토막 중 첫 번째 지번
    m = next((re.fullmatch(r'(\d{1,5})(?:-(\d{1,4}))?', t) for t in toks
              if re.fullmatch(r'\d{1,5}(?:-\d{1,4})?', t)), None)
    if not m:
        return None
    bun, ji = m.group(1), m.group(2) or '0'
    tail = a[a.index(m.group(0)) + len(m.group(0)):]
    dong = (re.search(r'(\d+)\s*동', tail) or [None, None])[1]
    hos = re.findall(r'(\d+(?:-\d+)?)\s*호', tail)
    return {'k': key, 'sgg': ent['sgg'], 'bjd': ent['bjd'],
            'bun': f'{int(bun):04d}', 'ji': f'{int(ji):04d}',
            'dong': f'{dong}동' if dong else None, 'ho': hos[-1] if hos else None}


def fetch(x):
    r = resolve(x)
    if not r:
        return None
    base = dict(sigunguCd=r['sgg'], bjdongCd=r['bjd'], bun=r['bun'], ji=r['ji'])
    out = {'src': '건축물대장'}

    if r['ho']:
        # 호명 표기가 '1211' 과 '903호' 로 섞여 온다. 둘 다 던져 보고 비교는
        # '호' 를 떼고 한다. numOfRows 가 작으면 공용 행에 밀려 전유 행이
        # 잘려 나가므로 넉넉히 받아 클라이언트에서 고른다.
        want = r['ho'].rstrip('호')
        rows = []
        for ho in (want, want + '호'):
            p = dict(base, numOfRows=100, hoNm=ho)
            if r['dong']:
                p['dongNm'] = r['dong']
            rows = [v for v in call('getBrExposPubuseAreaInfo', **p)
                    if v.get('exposPubuseGbCdNm') == '전유'
                    and str(v.get('hoNm') or '').rstrip('호') == want
                    and (not r['dong'] or str(v.get('dongNm') or '') == r['dong'])]
            if rows:
                break
        if rows:
            out['ar'] = round(sum(float(v.get('area') or 0) for v in rows), 2)
            out['purps'] = rows[0].get('etcPurps') or rows[0].get('mainPurpsCodeNm')
            out['flr'] = rows[0].get('flrNoNm')

    main = [v for v in call('getBrTitleInfo', **base, numOfRows=100)
            if v.get('mainAtchGbCdNm') == '주건축물']
    if r['dong']:
        m2 = [v for v in main if str(v.get('dongNm')) == r['dong']]
        main = m2 or main
    if main:
        v = main[0]
        out.update({k: v.get(s) for k, s in
                    (('bld', 'bldNm'), ('strct', 'strctCodeNm'),
                     ('use', 'mainPurpsCodeNm'), ('apr', 'useAprDay'),
                     ('hhld', 'hhldCnt'), ('gfl', 'grndFlrCnt'), ('ufl', 'ugrndFlrCnt'))
                    if v.get(s) not in (None, '', ' ')})
        if out.get('apr'):
            out['apr'] = re.sub(r'(\d{4})(\d{2})(\d{2})', r'\1-\2-\3', str(out['apr']))
    return out if len(out) > 1 else None


def main():
    D = json.load(open('data/data.json', encoding='utf-8'))
    todo = [x for x in D if not x.get('br') and resolve(x)]
    print(f'대상 {len(todo)}건 / 전체 {len(D)}', file=sys.stderr)
    done = 0
    with ThreadPoolExecutor(8) as ex:
        for x, br in zip(todo, ex.map(fetch, todo)):
            if br:
                x['br'] = br
                done += 1
    json.dump(D, open('data/data.json', 'w', encoding='utf-8'), ensure_ascii=False)
    with_ar = sum(1 for x in D if x.get('br', {}).get('ar'))
    print(f'건축물대장 매칭 {done}건 · 그중 전용면적 확보 {with_ar}건 · 전체 {len(D)}')


if __name__ == '__main__':
    main()
