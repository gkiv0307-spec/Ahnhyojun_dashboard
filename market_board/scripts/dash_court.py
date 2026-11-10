#!/usr/bin/env python3
"""대시보드 아침 루틴이 법원경매정보에서 읽어 둔 결과(ahj_market_chunk_*_results.json)를
현황판에 반영할 수 있게 data/court-in/ 형식으로 바꾼다. 반영은 apply_court.py 가 한다.

  scripts/dash_court.py            # 아직 안 바꾼 data/dash-in/*.json 을 모두
  scripts/dash_court.py data/dash-in/2026-09-30.json

2026-09-30 사용자 지시 "법원결과도 현황판에 자동 반영되게 해줘".

입력은 루틴 4-c(1) 이 Drive 의 _results 파일에서 옮겨 적은 data/dash-in/<날짜>.json 이다.
레코드마다 caseNumber · status · courtResult · courtCheckedAt · winningBid 만 쓴다
(memo 는 옮기지 않는다 — 실명이 섞일 수 있다). courtResult 꼴:

  진행중 · 매각기일 10/15 최저 203,000,000원   → 다음 기일·최저가
  2026-09-28 매각(670,500,000원)               → 매각, 낙찰가
  2026-09-07 변경 / 유찰 / 연기                → 그 기일의 결과
  2026-09-17 취하 / 기각 / 각하                 → 종료

법원 사건번호에는 법원이 없으므로 현황판 물건은 대시보드 추적 목록(dash-sent.json)의
(법원, 사건번호, 물건번호) 로 찾는다. 추적 목록에 없거나 법원이 둘 이상이면 건너뛴다.
사용자가 대시보드에서 낙찰·패찰로 정한 물건은 건드리지 않는다.
최저가는 옮겨 적는 과정의 오타를 막으려고 감정가의 0.7ⁿ·0.8ⁿ 계단에 맞는지 검산하고,
맞지 않으면 그 레코드를 버린다(틀린 숫자는 없는 숫자보다 나쁘다).
"""
import datetime, glob, json, os, re, sys

IN_DIR, OUT_DIR = 'data/dash-in', 'data/court-in'
BY = '법원경매정보(대시보드 조회)'
CLOSED = ('취하', '기각', '각하', '취소', '정지')
R_LIVE = re.compile(r'진행중\s*·\s*매각기일\s*(\d{1,2})/(\d{1,2})\s*최저\s*([\d,]+)원')
# '사건 기각 (2026-09-14)' 꼴 — 사건 전체가 끝난 경우
R_CASE = re.compile(r'(취하|기각|각하|취소)\s*\((\d{4}-\d{2}-\d{2})\)')
R_DONE = re.compile(r'(\d{4}-\d{2}-\d{2})\s*(매각|변경|유찰|연기|취하|기각|각하|취소|정지)(?:\(([\d,]+)원\))?')


def num(s):
    return int(s.replace(',', '')) if s else None


def ladder_ok(ap, mn):
    """최저가가 감정가에서 20%·30% 저감 계단(1000원 아래 버림 포함)으로 나오는가."""
    if not ap or not mn:
        return False
    for r in (0.7, 0.8):
        v = ap
        for _ in range(15):
            if abs(v - mn) <= 1000:
                return True
            v = v * r
    return False


def year_for(m, d, checked):
    c = datetime.date.fromisoformat(checked)
    y = c.year + (1 if m < c.month - 6 else 0)
    return f'{y}-{m:02d}-{d:02d}'


def convert(path, D, sent):
    recs = json.load(open(path, encoding='utf-8'))
    idx = {}
    for x in D:
        idx.setdefault((x.get('caNo'), x.get('ino') or 1), []).append(x)
    tracked = {(i.get('caNo'), i.get('ino') or 1): i.get('ct') for i in sent.get('items', [])}
    items, skipped = [], {}
    def skip(why):
        skipped[why] = skipped.get(why, 0) + 1
    checked_all = []
    for r in recs:
        cr = (r.get('courtResult') or '').strip()
        if not cr:
            skip('법원 결과 없음'); continue
        if r.get('status') in ('낙찰', '패찰'):
            skip('사용자가 낙찰·패찰로 정함'); continue
        m = re.match(r'\s*(\d{4}타경\d+)(?:\s*물건\s*(\d+))?', r.get('caseNumber') or '')
        if not m:
            skip('사건번호 형식'); continue
        key = (m.group(1), int(m.group(2) or 1))
        cands = idx.get(key) or []
        ct = tracked.get(key)
        if ct:
            cands = [x for x in cands if x.get('ct') == ct]
        if len(cands) != 1:
            skip('현황판에서 물건 특정 불가'); continue
        x = cands[0]
        checked = r.get('courtCheckedAt') or r.get('courtResultAt') or os.path.basename(path)[:10]
        checked_all.append(checked)
        it = {'ct': x['ct'], 'caNo': key[0], 'ino': key[1], 'full': False}
        lm = R_LIVE.search(cr)
        dm = R_DONE.search(cr)
        if lm:
            mn = num(lm.group(3))
            if not ladder_ok(x.get('ap'), mn):
                skip('최저가 계단 검산 불일치'); continue
            it['ld'] = [{'d': year_for(int(lm.group(1)), int(lm.group(2)), checked), 'amt': mn, 'res': None}]
        elif dm:
            d, kind, amt = dm.group(1), dm.group(2), num(dm.group(3))
            if kind in CLOSED:
                it['final'] = kind
                it['finalAt'] = d
                it['ld'] = []
            else:
                res = kind
                if kind == '매각':
                    wb = amt or r.get('winningBid')
                    res = f'매각({int(wb):,}원)' if wb else '매각'
                it['ld'] = [{'d': d, 'amt': None, 'res': res}]
        elif R_CASE.search(cr):
            cm = R_CASE.search(cr)
            it['final'], it['finalAt'], it['ld'] = cm.group(1), cm.group(2), []
        elif cr == '매각' and r.get('courtResultAt'):
            it['ld'] = [{'d': r['courtResultAt'], 'amt': None, 'res': '매각'}]
        else:
            skip('결과 문구를 못 읽음'); continue
        items.append(it)
    return items, skipped, max(checked_all) if checked_all else None


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    D = json.load(open('data/data.json', encoding='utf-8'))
    sent = json.load(open('data/dash-sent.json', encoding='utf-8'))
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(IN_DIR, '*.json')))
    for p in files:
        out = os.path.join(OUT_DIR, os.path.basename(p)[:-5] + '-dash.json')
        if not sys.argv[1:] and os.path.exists(out):
            continue
        recs = json.load(open(p, encoding='utf-8'))
        if not any(r.get('courtResult') for r in recs):
            continue       # 예전 형식(caseNumber·status 만) — 바꿀 게 없다
        items, skipped, checked = convert(p, D, sent)
        json.dump({'checkedAt': checked, 'by': BY, 'items': items},
                  open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        why = ' · '.join(f'{k} {v}' for k, v in skipped.items())
        print(f'  {os.path.basename(p)} → {out} · {len(items)}건' + (f' (건너뜀: {why})' if why else ''))


if __name__ == '__main__':
    main()
