#!/usr/bin/env python3
"""CODEF 대법원 경매사건검색 응답 -> 현황판 항목(JSON) 변환.

응답 구조에서 반드시 알고 있어야 할 세 가지:

1. `resProductList[].resDetailList` 는 그 물건의 구성요소가 아니라
   **사건 전체 목록을 물건마다 통째로 복사해 둔 것**이다.
   2026타경3375(4개 호실)에서 네 물건 모두 601·701·702·703호를 전부 달고
   나온다. 여기서 주소를 뽑으면 물건마다 남의 호실이 붙는다.
   물건별 주소는 `resInventoryList` 를 물건번호로 맞춰 써야 한다.

2. `resDateList` 도 사건 전체 기일이 한 배열에 섞여 있다. 물건번호로
   거르지 않으면 4개 물건 × 2회 유찰이 "8회 유찰"로 합산된다.

3. 일괄매각 사건은 같은 내용을 물건 수만큼 반복한다.
   (2026타경3229: 물건1=토지, 물건2=건물, 감정가·최저가·주소까지 동일)
   **주소까지 같을 때만** 한 건으로 접는다. 금액만 같고 주소가 다르면
   같은 평형의 다른 호실이므로 접으면 안 된다(3375의 물건1·4).
"""
import json, re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from auction_taxonomy import special_rights

_FINAL_CLOSED = ('배당종결', '취하', '기각', '각하', '정지')
_SOLD = ('매각허가', '대금납부', '배당')


def _d(v):
    """20260922 또는 20260922(1000) -> 2026-09-22. 형식이 다르면 None."""
    m = re.match(r'^(\d{4})(\d{2})(\d{2})', str(v or ''))
    return f'{m.group(1)}-{m.group(2)}-{m.group(3)}' if m else None


def _sp(*notes):
    out = []
    for n in notes:
        for r in special_rights(n):
            if r not in out:
                out.append(r)
    if '토지별도등기' in out and '별도등기' in out:
        out.remove('별도등기')
    return out


def _num(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def parse(raw):
    d = raw.get('data') or (raw if 'resCaseNumber' in raw else {})
    case_no = (d.get('resCaseNumber') or '').split()[0]
    final = (d.get('resFinalResult') or '').strip()
    case_note = d.get('resNote') or ''
    closed = any(k in final for k in _FINAL_CLOSED)
    common = {
        'caNo': case_no,
        'final': final,
        'receipt': _d(d.get('resReceiptDate')),
        'closedAt': _d(d.get('commEndDate')),
        'claim': _num(d.get('resClaimAmt')),
        'caseName': d.get('resCaseName') or None,
        'merger': (d.get('resMerger') or '').strip() or None,
    }

    # 물건번호 -> 주소. 물건별 소재지는 여기서만 정확히 나온다.
    inv = {}
    for x in d.get('resInventoryList') or []:
        n = _num(x.get('resNumber'))
        a = (x.get('resAddress') or '').strip()
        if n is not None and a:
            inv.setdefault(n, a)

    # 물건번호 -> (유찰횟수, 다음 매각기일, 그 기일의 최저가, 유찰 사다리)
    # resProductList.resAmount 가 비어 오는 사건이 흔하다(17건 중 7건).
    # 그때 최저가는 결과가 아직 없는 다음 매각기일의 resAmount 에 들어 있다.
    fails, nextd, nextamt, ladder = {}, {}, {}, {}
    for e in d.get('resDateList') or []:
        n = _num(e.get('resNumber'))
        desc = (e.get('resResultDesc') or '').strip()
        kind = (e.get('resKind') or '')
        dd, amt = _d(e.get('resDate')), _num(e.get('resAmount'))
        if '유찰' in desc:
            fails[n] = fails.get(n, 0) + 1
        if '매각기일' in kind:
            ladder.setdefault(n, []).append(
                {'d': dd, 'amt': amt, 'res': desc or None})
            if not desc and dd and (n not in nextd or dd < nextd[n]):
                nextd[n], nextamt[n] = dd, amt

    # 기일 목록 자체가 없으면 유찰 횟수를 '0회' 로 적을 수 없다. 0회는
    # '한 번도 유찰되지 않았다' 는 사실이고, 여기서 아는 건 '모른다' 뿐이다.
    # (2026-09-03: 목록이 빈 응답에서 화면에 유찰 0회가 찍혔다.)
    has_dates = bool(d.get('resDateList'))

    prods = d.get('resProductList') or []
    if not prods:
        # 취하·기각처럼 물건내역이 지워진 사건. 사건 단위로 한 건 남긴다.
        return {**common, 'items': [{
            **common, 'ino': 1, 'multi': [1], 'addr': None,
            'ap': None, 'mn': None, 'rt': None, 'ut': None,
            'st': '종료' if closed else '진행중',
            'f': None, 'd': None, 'state': None,
            'sp': _sp(case_note), 'prodNote': '', 'resultDesc': '',
        }]}

    seen, out = {}, []
    for p in prods:
        n = _num(p.get('resNumber')) or 1
        addr = inv.get(n)
        state = (p.get('resState') or '').strip()
        ap = _num(p.get('resValuationAmt'))
        mn = _num(p.get('resAmount')) or nextamt.get(n)
        key = (ap, mn, p.get('resUseType'), state, _d(p.get('resDate')), addr)
        if key in seen:                       # 일괄매각 중복 (주소까지 동일)
            seen[key]['multi'].append(n)
            continue

        st = '진행중'
        if closed:
            st = '종료'
        elif any(k in state for k in _SOLD):
            st = '매각'

        item = {
            **common,
            'ino': n, 'multi': [n], 'addr': addr,
            'ap': ap, 'mn': mn,
            'rt': round(mn / ap * 100) if ap and mn else None,
            'ut': (p.get('resUseType') or '').strip() or None,
            'st': st,
            'f': fails.get(n, 0) if has_dates else None,
            'd': _d(p.get('resDate')) or nextd.get(n),
            'state': state,
            'ld': ladder.get(n, []),
            'sp': _sp(p.get('resNote'), case_note),
            'prodNote': (p.get('resNote') or '').strip(),
            'resultDesc': (p.get('resResultDesc') or '').strip(),
        }
        seen[key] = item
        out.append(item)
    return {**common, 'items': out}


if __name__ == '__main__':
    res = []
    for path in sys.argv[1:]:
        raw = json.load(open(path, encoding='utf-8'))
        # 원본 응답에는 result 가 붙어 있고, data/codef-raw/ 아카이브본에는
        # 떼어져 있다(transactionId 를 남길 이유가 없어서). 둘 다 받는다.
        if 'result' in raw and (raw.get('result') or {}).get('code') != 'CF-00000':
            continue
        if 'data' not in raw and 'resCaseNumber' not in raw:
            continue
        r = parse(raw)
        r['court'] = os.path.basename(path).split('_')[0]
        for it in r['items']:
            it['ct'] = r['court']
        res.append(r)
    print(json.dumps(res, ensure_ascii=False, indent=1))
