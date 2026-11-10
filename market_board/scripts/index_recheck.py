#!/usr/bin/env python3
"""검색 색인으로 '기일이 지난 물건' 의 결과를 되짚는다 — CODEF 없이.

  scripts/index_recheck.py --targets               # 오늘 검색할 사건 목록(data/idx-targets.json)
  scripts/index_recheck.py raw.tsv                 # 신호만 찍는다(미리보기)
  scripts/index_recheck.py raw.tsv --write         # data.json 에 반영
  scripts/index_recheck.py raw.tsv --eval          # CODEF 로 확인한 물건을 정답지로
                                                   # 신호가 맞는지 잰다

왜 이게 필요한가
----------------
2026-09-25 에 CODEF 데모(1개월, 일 100회)가 끝났다. 유료 전환은 지금 안 된다
(사용자). 법원경매정보는 이 서버 IP 를 막고, 그 차단을 피해 가지는 않는다.
남은 합법 경로는 이미 발굴에 쓰는 네이버 웹문서 검색 API 뿐이다. 검색 결과
요약(스니펫)에 경매정보 사이트들이 결과를 적어 두는 경우가 있다.

**한쪽 방향으로만 믿는다** (2026-09-24 실측)
-----------------------------------------------
  · 매각·낙찰·종료 신호 — 나온 것은 전부 맞았다. 반영한다.
  · 진행중 신호 — 팔린 지 9일·16일 된 물건이 '진행중' 으로 나왔다. 색인이
    2~3주 늦게 따라온다. **버린다.** 아무 신호가 없으면 그대로 둔다.
  모르는 것을 아는 척하면 목록이 거짓말이 된다. 틀린 '매각' 표시는 진짜
  기회를 목록에서 지운다. 그래서 반영 조건을 좁게 잡았다.

읽는 스니펫 형식
----------------
  A) 경매알리미  제목 "…경매물건 '2025타경9286' 대구지방법원 아파트 3.8억"
                설명 "매각 · 아파트 ; 물건 1 대구지방법원 ; 1회 유찰 · 27일 전 ; …"
                → 맨 앞 상태 단어 + 'K일 전'. 날짜가 없어 '오늘-K일' 로 어림한다.
  B) richgo 결과 제목 "… 경매 낙찰가 3억 7,298만원 (감정가 90.8%, 응찰 9명) | 2025타경8313 [1] …"
                설명 "… 2025타경8313 [1] (대구지방법원) 결과: 2026-09-09 낙찰가 …"
                → 날짜·낙찰가(만원 단위)가 명시된다. 가장 믿을 만하다.
     richgo 종료 "… 경매 결과 (종료) | …" 설명 "… (법원). … 진행상태 종료"
     richgo 현황 "… 최저매각가 2억 9,820만원(감정가의 70%), 1회 유찰, 매각기일 2026-10-08 …"
                → 유찰 판정에 쓴다(아래 조건이 다 맞을 때만).
  C) 보스옥션   제목 "대구서부지원 2025타경31999"
                설명 "구분: 2차, 입찰기일: 2026-07-21, 최저매각가격: 87,500,000, 결과: 유찰 ; …"
                → 기일별 결과표. 금액이 원 단위로 정확하다.

반영 조건 (하나라도 어긋나면 버린다)
------------------------------------
  · 법원·사건번호가 맞아야 한다. 물건번호가 스니펫에 있으면 그것도 맞아야 하고,
    없으면 그 사건에 물건이 하나뿐일 때만 쓴다.
  · 기일이 이미 지난 물건에만 쓴다. 미래 기일 물건은 되짚을 게 없다.
  · 신호의 날짜가 우리가 아는 그 기일보다 앞서면 버린다 — 예전 매각(대금
    미납 → 재매각) 이 섞여 들어오는 것을 막는다.
  · 유찰은 (a) 새 기일이 지난 기일보다 뒤이고 (b) 유찰 횟수가 하나 늘었고
    (c) 새 최저가가 이전 최저가 × 0.7 또는 0.8 과 맞아야 한다(저감 계단 검산).
    richgo 는 만원 단위라 정확한 금액은 계단으로 계산해 넣고 mnApprox 를 켠다.
출처는 st·ld 옆에 idx(검색 색인) 로 남긴다. 화면은 '법원 확인' 과 따로
'색인 확인' 배지를 단다 — 법원 원본이 아니라는 한계를 지우지 마라.
"""
import argparse, datetime, json, math, re, sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from harvest_nice import clean, krw  # noqa: E402

CASE = r'(20\d{2}타경\d+)'
# ── A) 경매알리미 ──────────────────────────────────────────────
A_TITLE = re.compile(r"경매물건\s*'" + CASE + r"'\s*(\S+)")
A_DESC = re.compile(r'^\s*(매각|진행중|매각기일|종료|취하|기각|정지|변경|유찰)\s*·'
                    r'.*?물건\s*(\d+)\s+(\S+)'
                    r'(?:.*?(\d+)회\s*유찰)?'
                    r'(?:.*?(\d+)일\s*전)?')
# ── B) richgo ───────────────────────────────────────────────────
B_WHERE = re.compile(CASE + r'\s*\[(\d+)\]\s*\(([^)]+)\)')
B_SOLD = re.compile(r'결과:\s*(20\d{2}-\d{2}-\d{2})\s*낙찰가\s*([\d억,\s만]+원)')
B_END = re.compile(r'진행상태\s*(종료|취하|기각|각하)')
B_NOW = re.compile(r'최저매각가\s*([\d억,\s만]+원)\s*\(감정가의\s*(\d+)%\)\s*,\s*'
                   r'(?:(\d+)회\s*유찰|신건)\s*,\s*매각기일\s*(20\d{2}-\d{2}-\d{2})')
# ── C) 보스옥션 기일표 ──────────────────────────────────────────
C_TITLE = re.compile(r'^\s*(\S+(?:지방법원|지원))\s+' + CASE + r'\s*$')
C_ROW = re.compile(r'입찰기일:\s*(20\d{2}-\d{2}-\d{2})\s*,\s*최저매각가격:\s*([\d,]+)\s*,\s*결과:\s*(\S+?)(?:\s*;|$)')

TERMINAL = {'매각', '종료', '취하', '기각', '각하', '정지'}
LIVE = {'진행중', '미확인'}
QUERY = '{caNo} 매각기일 최저입찰가 결과'   # 2026-09-24 실측으로 고른 꼴. 바꾸면 --eval 부터 다시
TARGETS = Path(__file__).resolve().parent.parent / 'data' / 'idx-targets.json'


def d(s):
    return datetime.date.fromisoformat(s) if s else None


def signals(rows, today):
    """스니펫 한 줄에서 신호를 뽑는다. '진행중' 류는 따로 세기만 한다."""
    out, ignored = [], 0
    for title, desc in rows:
        t, s = clean(title), clean(desc)
        # A) 경매알리미
        mt = A_TITLE.search(t)
        md = A_DESC.search(s)
        if mt and md:
            state, ino, court, fcnt, ago = md.groups()
            if state in TERMINAL and ago:
                out.append({'src': '경매알리미', 'ct': court, 'caNo': mt.group(1),
                            'ino': int(ino), 'kind': '매각' if state == '매각' else '종료',
                            'date': (today - datetime.timedelta(days=int(ago))).isoformat(),
                            'approx': True, 'f': int(fcnt) if fcnt else None, 'text': s[:120]})
            elif state not in TERMINAL:
                ignored += 1
            continue
        # B) richgo
        mw = B_WHERE.search(s)
        if mw:
            caNo, ino, court = mw.group(1), int(mw.group(2)), mw.group(3).strip()
            ms = B_SOLD.search(s)
            me = B_END.search(s)
            mn = B_NOW.search(s)
            if ms:
                out.append({'src': 'richgo', 'ct': court, 'caNo': caNo, 'ino': ino,
                            'kind': '매각', 'date': ms.group(1), 'approx': False,
                            'amt': krw(ms.group(2)), 'amtUnit': 10_000, 'text': s[:120]})
            elif me:
                out.append({'src': 'richgo', 'ct': court, 'caNo': caNo, 'ino': ino,
                            'kind': '종료', 'date': None, 'approx': True, 'text': s[:120]})
            elif mn:
                out.append({'src': 'richgo', 'ct': court, 'caNo': caNo, 'ino': ino,
                            'kind': '현황', 'next': mn.group(4), 'mn': krw(mn.group(1)),
                            'rt': int(mn.group(2)), 'f': int(mn.group(3) or 0),
                            'amtUnit': 10_000, 'text': s[:120]})
            continue
        # C) 보스옥션
        mc = C_TITLE.search(t)
        if mc and C_ROW.search(s):
            rows_ = [(a, int(b.replace(',', '')), r) for a, b, r in C_ROW.findall(s)]
            out.append({'src': '보스옥션', 'ct': mc.group(1), 'caNo': mc.group(2),
                        'ino': None, 'kind': '기일표', 'rows': rows_, 'text': s[:120]})
    return out, ignored


def index_items(D):
    by_case = defaultdict(list)
    for x in D:
        by_case[(x.get('ct'), x.get('caNo'))].append(x)
    return by_case


def target(by_case, sg):
    """신호가 가리키는 물건 하나. 물건번호를 모르면 물건이 하나뿐일 때만."""
    xs = by_case.get((sg['ct'], sg['caNo'])) or []
    if sg.get('ino') is not None:
        xs = [x for x in xs if (x.get('ino') or 1) == sg['ino']]
    return xs[0] if len(xs) == 1 else None


def ladder_ok(prev, new, unit):
    """new 가 prev×0.7 또는 ×0.8 과 맞나. 법원은 천원 단위로 올린다
    (140,973,000×0.7=98,681,100 → 98,682,000). unit 은 스니펫 금액의 정밀도."""
    if not prev or not new:
        return None
    for r in (0.7, 0.8):
        exact = math.ceil(prev * r / 1000) * 1000
        if abs(exact - new) < unit:
            return exact
    return None


def decide(x, sg, today):
    """신호를 이 물건에 반영할지. (적용할 변경, 버린 이유) 를 돌려준다."""
    if x.get('st') not in LIVE:
        return None, f"이미 {x.get('st')} 인 물건"
    last = x.get('d')
    if not last:
        return None, '기일 미상 — 기준점이 없다'
    if d(last) >= today:
        return None, '기일이 아직 안 지났다'
    k = sg['kind']
    if k in ('매각', '종료'):
        if sg.get('date'):
            sd = d(sg['date'])
            # 'K일 전' 은 색인 시점 기준이라 실제 기일보다 늦게 찍힌다. 앞서면 예전 일이다.
            slack = 3 if sg.get('approx') else 0
            if sd < d(last) - datetime.timedelta(days=slack):
                return None, f"신호 날짜 {sg['date']} 가 마지막 기일 {last} 보다 앞선다(예전 매각일 수 있음)"
        elif k == '매각':
            return None, '매각인데 날짜가 없다'
        ch = {'st': k, 'stSrc': 'idx', 'stAt': today.isoformat(), 'stBy': sg['src']}
        if k == '매각' and sg.get('amt'):
            ch['winBid'] = sg['amt']
            ch['winBidApprox'] = sg.get('amtUnit', 1) > 1
        return ch, None
    if k == '현황':
        if d(sg['next']) <= d(last):
            return None, '새 기일이 아니다'
        if x.get('f') is None or sg['f'] != (x.get('f') or 0) + 1:
            return None, f"유찰 횟수가 하나 늘지 않았다({x.get('f')}→{sg['f']})"
        exact = ladder_ok(x.get('mn'), sg['mn'], sg.get('amtUnit', 1))
        if not exact:
            return None, '저감 계단 검산 불일치'
        return {'fail': {'d': last, 'amt': x.get('mn')}, 'd': sg['next'], 'mn': exact,
                'f': sg['f'], 'mnApprox': True, 'stSrc': 'idx', 'stAt': today.isoformat(),
                'stBy': sg['src']}, None
    if k == '기일표':
        rows = sorted(sg['rows'])
        hit = [r for r in rows if r[0] == last]
        if not hit:
            return None, '마지막 기일이 기일표에 없다'
        _, amt, res = hit[-1]
        if x.get('mn') and amt != x['mn']:
            return None, f'기일표 최저가 {amt:,} 가 우리 값 {x["mn"]:,} 과 다르다'
        if res.startswith('매각'):
            return {'st': '매각', 'stSrc': 'idx', 'stAt': today.isoformat(), 'stBy': sg['src']}, None
        if res.startswith('유찰'):
            nxt = [r for r in rows if r[0] > last]
            if not nxt:
                return None, '유찰은 확인했지만 다음 기일이 아직 없다'
            nd, namt, _ = nxt[0]
            if not ladder_ok(x.get('mn'), namt, 1):
                return None, '다음 최저가가 저감 계단과 안 맞는다'
            return {'fail': {'d': last, 'amt': x.get('mn')}, 'd': nd, 'mn': namt,
                    'f': (x.get('f') or 0) + 1, 'stSrc': 'idx', 'stAt': today.isoformat(),
                    'stBy': sg['src']}, None
        return None, f'결과 "{res}" 는 반영하지 않는다'
    return None, '알 수 없는 신호'


def apply(x, ch):
    fail = ch.pop('fail', None)
    if fail:
        ld = x.setdefault('ld', [])
        if not any(e.get('d') == fail['d'] and e.get('res') for e in ld):
            # 이미 있는 '결과 미게시' 기일이면 그 칸에 결과만 채운다
            for e in ld:
                if e.get('d') == fail['d'] and not e.get('res'):
                    e['res'] = '유찰'; break
            else:
                ld.append({'d': fail['d'], 'amt': fail['amt'], 'res': '유찰'})
        ld.append({'d': ch['d'], 'amt': ch['mn'], 'res': None})
    x.update(ch)
    if x.get('ap') and x.get('mn'):
        x['rt'] = round(x['mn'] / x['ap'] * 100)


def truth_ok(x, sg):
    """--eval 용. CODEF 로 확인한 기록과 신호가 맞는가. None 이면 판정 불가."""
    va = x.get('verifiedAt')
    k = sg['kind']
    ld = x.get('ld') or []
    if k in ('매각', '종료'):
        sold = [e for e in ld if str(e.get('res') or '').startswith('매각')]
        if x.get('st') in ('매각', '종료') or sold:
            if k == '매각' and sg.get('date') and not sg.get('approx') and sold:
                return any(e['d'] == sg['date'] for e in sold)
            return True
        # 정답이 더 오래돼 그 뒤 일을 모를 수 있다
        if sg.get('date') and va and sg['date'] > va:
            return None
        # CODEF 가 그 기일을 '결과 미게시' 로 준 것은 진행중이라는 답이 아니다
        # (법원→CODEF 반영이 며칠 늦다). 2026-09-24 에 09-15~21 기일 5건이 그랬고
        # 전부 다른 출처와 같은 날짜로 매각이었다.
        if sg.get('date'):
            slack = datetime.timedelta(days=3 if sg.get('approx') else 0)
            if any(not e.get('res') and d(e['d']) >= d(sg['date']) - slack for e in ld if e.get('d')):
                return None
        return False
    if k == '현황':
        return any(e.get('d') == sg['next'] for e in ld) or (x.get('d') == sg['next']) or \
            (None if (va and sg['next'] > va) else False)
    if k == '기일표':
        want = {(e.get('d'), e.get('amt')) for e in ld}
        got = {(a, b) for a, b, _ in sg['rows']}
        common = want & got
        return bool(common) if want else None
    return None


def kst_today():
    # 컨테이너 시계는 UTC 다. 06시 KST 실행이면 UTC 로는 아직 전날이다.
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9)).date()


def make_targets(items, today, limit):
    """기일이 지났는데 결과를 모르는 물건의 사건 목록. 사건 단위로 한 번만 찾는다.

    순서: 대시보드에 보낸 물건 → 대구권 → 나머지, 같은 층 안에서는 마지막으로
    찾아본 날(idxAt)이 오래된 것부터. 색인은 결과를 며칠~몇 주 늦게 싣는다 —
    한 번 못 찾았다고 끝이 아니므로 대시보드 전송분은 매일, 나머지는 사흘마다 다시 본다."""
    sp = TARGETS.parent / 'dash-sent.json'
    sent = {i['key'] for i in json.loads(sp.read_text(encoding='utf-8')).get('items', [])} if sp.exists() else set()
    cases = {}
    for x in items:
        if x.get('st') not in LIVE or not x.get('d') or not x.get('caNo') or d(x['d']) >= today:
            continue
        tier = 0 if f"ct-{x['caNo']}-{x.get('ino') or 1}" in sent else (1 if x.get('r') == '대구' else 2)
        seen = x.get('idxAt')
        if seen and (today - d(seen)).days < (1 if tier == 0 else 3):
            continue
        k = (x.get('ct'), x['caNo'])
        c = cases.setdefault(k, {'ct': k[0], 'caNo': k[1], 'tier': tier, 'idxAt': seen or '', 'd': x['d']})
        c['tier'] = min(c['tier'], tier)
        c['idxAt'] = min(c['idxAt'], seen or '')
    out = sorted(cases.values(), key=lambda c: (c['tier'], c['idxAt'], c['d']))[:limit]
    for c in out:
        c['query'] = QUERY.format(caNo=c['caNo'])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('tsv', nargs='?')
    ap.add_argument('--targets', action='store_true')
    ap.add_argument('--limit', type=int, default=40)
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--eval', action='store_true')
    ap.add_argument('--today', default=None)
    a = ap.parse_args()
    today = d(a.today) if a.today else kst_today()
    if a.targets:
        D = json.load(open('data/data.json', encoding='utf-8'))
        T = make_targets(D, today, a.limit)
        TARGETS.write_text(json.dumps({'date': today.isoformat(), 'query': QUERY, 'items': T},
                                      ensure_ascii=False, indent=1), encoding='utf-8')
        from collections import Counter
        n = Counter(c['tier'] for c in T)
        print(f'검색 대상 {len(T)}사건 (대시보드 {n[0]} · 대구 {n[1]} · 기타 {n[2]}) → {TARGETS.name}')
        for c in T:
            print(f"  {c['ct']} {c['caNo']}  기일 {c['d']}  ⇒ {c['query']}")
        return
    if not a.tsv:
        ap.error('raw.tsv 가 필요하다 (또는 --targets)')
    rows = [l.rstrip('\n').split('\t', 1) for l in open(a.tsv, encoding='utf-8') if '\t' in l]
    sgs, ignored = signals(rows, today)
    D = json.load(open('data/data.json', encoding='utf-8'))
    items = D if isinstance(D, list) else D['items']
    by_case = index_items(items)
    print(f'스니펫 {len(rows)}줄 · 신호 {len(sgs)}개 · 버린 진행중 신호 {ignored}개')

    if a.eval:
        tally = defaultdict(lambda: [0, 0, 0])   # 맞음, 틀림, 판정불가
        wrong = []
        for sg in sgs:
            x = target(by_case, sg)
            if not x or not x.get('verified'):
                continue
            ok = truth_ok(x, sg)
            key = f"{sg['src']}·{sg['kind']}"
            tally[key][0 if ok else (2 if ok is None else 1)] += 1
            if ok is False:
                wrong.append((key, sg['ct'], sg['caNo'], sg.get('ino'), x.get('st'), sg['text'][:80]))
        print('\n출처·신호별  맞음 / 틀림 / 판정불가')
        for k, (g, b, u) in sorted(tally.items()):
            print(f'  {k:<16} {g:>3} / {b:>3} / {u:>3}')
        for w in wrong:
            print('  ✗', *w)
        return

    done = skip = 0
    reasons = defaultdict(int)
    for sg in sgs:
        x = target(by_case, sg)
        if not x:
            reasons['보드에 없거나 물건 특정 불가'] += 1
            continue
        ch, why = decide(x, sg, today)
        if not ch:
            reasons[why.split(' — ')[0].split('(')[0].strip()] += 1
            skip += 1
            continue
        print(f"  + {x['ct']} {x['caNo']}[{x.get('ino') or 1}] {x.get('st')}→{ch.get('st', '유찰')}"
              f" ({sg['src']}) {sg['text'][:60]}")
        if a.write:
            apply(x, ch)
        done += 1
    # 오늘 찾아본 사건은 신호가 없어도 idxAt 을 찍는다 — 내일 같은 것만 또 찾지 않게.
    marked = 0
    if a.write and TARGETS.exists():
        T = json.loads(TARGETS.read_text(encoding='utf-8'))
        if T.get('date') == today.isoformat():
            want = {(c['ct'], c['caNo']) for c in T['items']}
            for x in items:
                if (x.get('ct'), x.get('caNo')) in want:
                    x['idxAt'] = today.isoformat()
                    marked += 1
    print(f'반영 {done}건 · 버림 {skip}건 · 찾아본 물건 {marked}건 표시')
    for r, n in sorted(reasons.items(), key=lambda t: -t[1]):
        print(f'  - {r}: {n}')
    if a.write and (done or marked):
        json.dump(D, open('data/data.json', 'w', encoding='utf-8'), ensure_ascii=False)
        print('저장 data.json')
    elif not a.write:
        print('(미리보기 — --write 로 반영)')


if __name__ == '__main__':
    main()
