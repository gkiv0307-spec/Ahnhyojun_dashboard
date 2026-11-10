#!/usr/bin/env python3
"""온비드 공매 물건목록을 받아 data/onbid.json 으로 저장한다.

한국자산관리공사_온비드 부동산 물건목록 (data.go.kr B010003).
  https://apis.data.go.kr/B010003/OnbidRlstListSrvc2/getRlstCltrList2

**필수 요청변수는 `prptDivCd` 와 `pvctTrgtYn` 둘이다.** 이걸 몰라서 오랫동안
NO_MANDATORY_REQUEST_PARAMETERS_ERROR(코드 11) 만 받았다. 공식 활용가이드는
data.go.kr 로그인이 필요하고 이 서버에서는 egress 가 막혀 있어, 파라미터
조합을 직접 넣어 보고 찾아냈다.

  prptDivCd  0002 공유재산 · 0004 불용품 · 0005 기타일반재산
             0007 압류재산 · 0010 국유재산
  pvctTrgtYn 수의계약 대상 여부(Y/N). **두 값이 서로 다른 집합**이라 둘 다 받아야 한다.

먹는 필터: `lctnSdnm`(시도명), `pbctStatCd`(입찰상태).
안 먹는 것: sidoNm · SIDO · addr · cltrUsgLclsCtgrId · cltrBidBgngDt (전부 무시된다)

**같은 물건(onbidCltrno)이 입찰 회차마다 한 행씩 나온다.** 대구권 7,216행이
실제로는 1,899개 물건이다. 물건 단위로 접되 아무 회차나 남기면 안 된다 —
진행중 회차를 우선하고, 그다음 입찰 종료일이 늦은 것을 남긴다.
"""
import json, os, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

URL = 'https://apis.data.go.kr/B010003/OnbidRlstListSrvc2/getRlstCltrList2'
KEY = open(os.path.expanduser('~/.secrets/datagokr-bld')).read().strip()
DIVS = ['0002', '0004', '0005', '0007', '0010']
SIDO = {'대구광역시': '대구', '경상북도': '경북'}
ROWS = 100
# 입찰일이 없는 물건은 이 값으로 온다. 날짜로 쓰면 안 된다.
SENTINEL = '2999'


def get(**p):
    q = '&'.join(f'{k}={urllib.parse.quote(str(v))}' for k, v in p.items())
    url = f'{URL}?serviceKey={urllib.parse.quote(KEY, safe="")}&{q}'
    for i in range(4):
        try:
            with urllib.request.urlopen(url, timeout=45) as r:
                return ET.fromstring(r.read())
        except Exception:
            time.sleep(1.5 * (i + 1))
    return None


def dt(v):
    """202609031600 → ('2026-09-03', '16:00'). 값이 없거나 sentinel 이면 None."""
    v = (v or '').strip()
    if len(v) < 8 or v.startswith(SENTINEL):
        return None, None
    return f'{v[:4]}-{v[4:6]}-{v[6:8]}', (f'{v[8:10]}:{v[10:12]}' if len(v) >= 12 else None)


def num(v):
    try:
        return int(float(str(v).strip()))
    except (TypeError, ValueError):
        return None


def row(it, sido):
    g = lambda t: (it.findtext(t) or '').strip()
    bgn, bgnt = dt(g('cltrBidBgngDt'))
    end, endt = dt(g('cltrBidEndDt'))
    ap, mn = num(g('apslEvlAmt')), num(g('lowstBidPrcIndctCont'))
    return {
        'id': g('onbidCltrno'), 'mg': g('cltrMngNo'), 'nm': g('onbidCltrNm'),
        'div': g('prptDivNm'), 'disp': g('dspsMthodNm'), 'bid': g('bidDivNm'),
        'lcls': g('cltrUsgLclsCtgrNm'), 'mcls': g('cltrUsgMclsCtgrNm'),
        'scls': g('cltrUsgSclsCtgrNm'),
        'r': SIDO.get(sido, sido), 'a1': g('lctnSggnm'), 'a2': g('lctnEmdNm'),
        'ap': ap, 'mn': mn,
        'rt': round(mn / ap * 100) if ap and mn else None,
        'bgn': bgn, 'bgnt': bgnt, 'end': end, 'endt': endt,
        'st': g('pbctStatNm'), 'f': num(g('usbdNft')),
        'org': g('orgNm'), 'req': g('rqstOrgNm'),
        'land': num(g('landSqms')), 'bld': num(g('bldSqms')),
        'rent': g('rentPerdCont') if g('dspsMthodNm') == '임대' else '',
        'sq': num(g('pbctNsq')),
    }


# 어느 회차를 남길지. 큰 값이 이긴다.
_ST_RANK = {'입찰진행중': 3, '수의계약가능': 2, '입찰준비중': 1}


def better(a, b):
    ka = (_ST_RANK.get(a['st'], 0), a['end'] or '', a['sq'] or 0)
    kb = (_ST_RANK.get(b['st'], 0), b['end'] or '', b['sq'] or 0)
    return a if ka >= kb else b


def main():
    jobs = [(d, y, s) for d in DIVS for y in ('N', 'Y') for s in SIDO]
    out = {}

    def pull(job):
        d, y, s = job
        head = get(pageNo=1, numOfRows=1, prptDivCd=d, pvctTrgtYn=y, lctnSdnm=s)
        if head is None:
            return []
        tot = num(head.findtext('.//totalCount')) or 0
        if not tot:
            return []
        res = []
        for pg in range(1, (tot - 1) // ROWS + 2):
            x = get(pageNo=pg, numOfRows=ROWS, prptDivCd=d, pvctTrgtYn=y, lctnSdnm=s)
            if x is None:
                break
            res += [row(i, s) for i in x.iter('item')]
        return res

    seen = 0
    with ThreadPoolExecutor(6) as ex:
        for rows in ex.map(pull, jobs):
            seen += len(rows)
            for r in rows:
                if not r['id']:
                    continue
                out[r['id']] = better(out[r['id']], r) if r['id'] in out else r

    data = sorted(out.values(), key=lambda r: (r['end'] or '9999', r['nm']))
    json.dump(data, open('data/onbid.json', 'w', encoding='utf-8'), ensure_ascii=False)
    from collections import Counter
    print(f'온비드 {seen}행 → 물건 {len(data)}건 저장')
    print('  구분   ', dict(Counter(r['div'] for r in data)))
    print('  상태   ', dict(Counter(r['st'] for r in data)))
    print('  대분류 ', dict(Counter(r['lcls'] for r in data)))
    live = [r for r in data if r['end'] and r['end'] >= '2026-01-01'
            and r['st'] in ('입찰진행중', '입찰준비중')]
    print(f'  2026년 진행/예정 {len(live)}건')


if __name__ == '__main__':
    main()
