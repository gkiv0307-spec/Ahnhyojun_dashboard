#!/usr/bin/env python3
"""법원경매정보에서 읽은 기일내역(data/court-in/<날짜>.json)을 대시보드 데일리 경매분석 카드
갱신 파일(패치 전용 market 청크)과 변경 이력으로 바꾼다. 현황판에 없는 카드도 다룬다.

  python -I -X utf8 scripts/dash_court_chunk.py data/court-in/2026-11-02.json

읽는 것: court-in 파일 + data/dash-out/dash-pending.json (scripts/dash_pending.py 가 만든 카드 목록)
쓰는 것: data/dash-out/dash-court-<날짜>.json + .title  (Drive 에 올릴 청크: ahj_market_chunk_<날짜>_pcresults_<stamp>.json)
        data/dash-out/dash-court-changelog-<날짜>.json + .title  (ahj_court_changelog_<날짜>.json)

판정 규칙(2026-11-02 사용자 지시와 그간의 규칙):
  - 마지막 결과가 매각 → 상태 '매각종료' + 낙찰가. '입찰예정' 카드도 똑같이 처리한다
    (2026-11-02 사용자 "난 입찰예정이라고 한 적이 없는데. 그거랑 상관없이 결과 입력해서 넣어주면 돼" —
    입찰예정은 사용자가 고른 상태가 아니다). 실제로 입찰해 낙찰/패찰이면 사용자가 카드에서 바꾼다.
  - 유찰 → 유찰 횟수는 기일내역의 유찰 행 수. 다음 기일이 있으면 기일·최저가를 옮긴다.
  - 변경·연기 → 다음 기일이 있으면 그 기일로, 없으면 상태 '변경' + ⚠ 재확인. 집행정지면 적는다.
  - 종국(취하·기각·각하·취소) → 상태 '취하'.
  - 카드 값과 하나도 다르지 않으면 보내지 않는다(불필요한 갱신으로 사용자가 고친 값을 덮지 않게).
  - 권리분석 등 무관한 칸은 건드리지 않는다. 실명은 어디에도 넣지 않는다.
"""
import argparse, datetime, json, os, pathlib, re

PENDING = os.path.join('data', 'dash-out', 'dash-pending.json')
OUT_DIR = os.path.join('data', 'dash-out')
URL = 'https://www.courtauction.go.kr/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ159M00.xml'
BY = 'PC GPT 화면 확인'   # 대시보드 루틴이 '법원 확인' 으로 읽는 표기값(크롬 세션이 직접 확인)
CLOSED = ('취하', '기각', '각하', '취소')
FIELDS = ('status', 'saleDate', 'minSalePrice', 'failCount', 'winningBid')


def kst_now():
    return datetime.datetime.now(datetime.timezone.utc)


def won(n):
    return f'{n:,}원'


def md(d):
    return d[5:].replace('-', '/')


def judge(item, card, today, src):
    """court-in 항목 하나 → 카드 패치(dict) 또는 None(변동 없음)."""
    ld = sorted(item.get('ld') or [], key=lambda r: r['d'])
    decided = [r for r in ld if r.get('res')]
    future = [r for r in ld if not r.get('res') and r['d'] >= today]
    p = {'caseNumber': card['caseNumber'], 'courtCheckedAt': today, 'courtCheckedBy': BY,
         'courtSourceUrl': URL, 'updatedAt': kst_now().isoformat().replace('+00:00', 'Z')}
    note = []
    if item.get('stay'):
        note.append(f'사건 {item["stay"]}')
    fin = item.get('final')
    if fin and any(k in fin for k in CLOSED):
        p.update(status='취하', courtResult=f'{item.get("finalAt") or ""} {fin}'.strip(),
                 courtStatusRaw=f'종국결과 {fin} {item.get("finalAt") or ""}'.strip())
        note.insert(0, f'사건 종국 {fin}' + (f'({item["finalAt"]})' if item.get('finalAt') else ''))
    elif not decided:
        return None, '결과 행 없음'
    else:
        last = decided[-1]
        res = last['res']
        nfail = sum(1 for r in decided if r['res'] == '유찰')
        if res.startswith('매각'):
            wb = last.get('winBid') or 0
            p.update(winningBid=wb, courtResult=f'{last["d"]} 매각({won(wb)})' if wb else f'{last["d"]} 매각(낙찰가 미확인)',
                     courtStatusRaw=f'{last["d"]} 매각기일 매각' + (f' ({won(wb)})' if wb else ''))
            p['status'] = '매각종료'
            note.insert(0, f'{md(last["d"])} 매각({won(wb) if wb else "낙찰가 미확인"}) — 직접 입찰했으면 낙찰/패찰로 바꿔주세요')
        elif res == '유찰':
            p.update(status='유찰', failCount=nfail)
            if future:
                nx = future[0]
                p.update(saleDate=nx['d'], minSalePrice=nx['amt'],
                         courtResult=f'진행중 · 매각기일 {md(nx["d"])} 최저 {won(nx["amt"])}',
                         courtStatusRaw=f'{last["d"]} 매각기일 유찰 → {nx["d"]} 매각기일 최저 {won(nx["amt"])}')
                note.insert(0, f'{md(last["d"])} 유찰({nfail}회) → 다음 기일 {md(nx["d"])} 최저가 {won(nx["amt"])}')
            else:
                p.update(courtResult=f'⚠ 재확인: {last["d"]} 유찰 · 다음 기일 미정',
                         courtStatusRaw=f'{last["d"]} 매각기일 유찰 · 이후 기일 없음')
                note.insert(0, f'{md(last["d"])} 유찰({nfail}회), 다음 기일 아직 없음')
        elif res in ('변경', '연기') or res.endswith('(재매각)'):
            if future:
                nx = future[0]
                p.update(status='유찰' if nfail else card.get('status') if card.get('status') != '변경' else '조사중',
                         failCount=nfail, saleDate=nx['d'], minSalePrice=nx['amt'],
                         courtResult=f'진행중 · 매각기일 {md(nx["d"])} 최저 {won(nx["amt"])}',
                         courtStatusRaw=f'{last["d"]} 매각기일 {res} → {nx["d"]} 매각기일 최저 {won(nx["amt"])}')
                note.insert(0, f'{md(last["d"])} {res} → 새 기일 {md(nx["d"])} 최저가 {won(nx["amt"])}')
            else:
                p.update(status='변경',
                         courtResult=f'⚠ 재확인: {last["d"]} {res} · 새 기일 미정' + (' · 집행정지됨' if item.get('stay') else ''),
                         courtStatusRaw=f'{last["d"]} 매각기일 {res} · 이후 기일 없음' + (f' · {item["stay"]}' if item.get('stay') else ''))
                note.insert(0, f'{md(last["d"])} 기일 {res}, 새 기일 미정')
        elif any(k in res for k in CLOSED):
            p.update(status='취하', courtResult=f'{last["d"]} {res}', courtStatusRaw=f'{last["d"]} 매각기일 {res}')
            note.insert(0, f'{md(last["d"])} {res}')
        else:
            return None, f'모르는 결과 {res!r}'
    changed = [f for f in FIELDS if f in p and p[f] != (card.get(f) if card.get(f) is not None else (0 if f in ('winningBid', 'failCount') else None))]
    if not changed and (card.get('courtResult') or '') == p.get('courtResult'):
        return None, '변동 없음'
    p['memo'] = f'결과 입력 ({today}) — ' + ' · '.join(note) + f' · {src}'
    p['_changed'] = changed
    return p, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('courtin')
    ap.add_argument('--pending', default=PENDING)
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--today', default=None)
    a = ap.parse_args()
    ci = json.load(open(a.courtin, encoding='utf-8'))
    today = a.today or ci.get('checkedAt') or kst_now().date().isoformat()
    pend = json.load(open(a.pending, encoding='utf-8'))
    cards = pend['items'] if isinstance(pend, dict) else pend
    src = f'법원경매정보 화면 확인(크롬·{today})'
    by_case = {}
    for c in cards:
        by_case.setdefault(c['caNo'], []).append(c)
    chunk, log, lines = [], [], []
    for it in ci.get('items') or []:
        if it.get('hold'):
            lines.append(f"  {it['caNo']}[{it.get('ino') or 1}]  hold — 보내지 않음")
            continue
        cands = by_case.get(it['caNo']) or []
        ino = it.get('ino') or 1
        hit = [c for c in cands if c['ino'] == ino] or ([c for c in cands if not c.get('hasIno')] if ino == 1 else [])
        if not hit:
            lines.append(f"  {it['caNo']}[{ino}]  대시보드 대상 목록에 없음")
            continue
        for card in hit:
            p, why = judge(it, card, today, src)
            if not p:
                lines.append(f"  {card['caseNumber']}  {why}")
                continue
            for f in p.pop('_changed'):
                log.append({'caseNumber': card['caseNumber'], 'field': f, 'before': card.get(f), 'after': p[f],
                            'checkedAt': today, 'source': src, 'reason': p['courtResult']})
            chunk.append(p)
            lines.append(f"  {card['caseNumber']:<22} {card['status']}→{p.get('status', card['status'])}  {p['courtResult']}")
    print(f'court-in {len(ci.get("items") or [])}건 · 카드 갱신 {len(chunk)}건 · 변경 이력 {len(log)}항목')
    for l in lines:
        print(l)
    if not chunk:
        return
    out = pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    stamp = kst_now().strftime('%Y%m%dT%H%M%S')
    (out / f'dash-court-{today}.json').write_text(json.dumps(chunk, ensure_ascii=False, indent=1), encoding='utf-8')
    (out / f'dash-court-{today}.title').write_text(f'ahj_market_chunk_{today}_pcresults_{stamp}.json', encoding='utf-8')
    (out / f'dash-court-changelog-{today}.json').write_text(json.dumps(log, ensure_ascii=False, indent=1), encoding='utf-8')
    (out / f'dash-court-changelog-{today}.title').write_text(f'ahj_court_changelog_{today}.json', encoding='utf-8')
    print(f'저장 {out}/dash-court-{today}.json → Drive 이름 {(out / f"dash-court-{today}.title").read_text()}')
    print(f'저장 {out}/dash-court-changelog-{today}.json → Drive 이름 ahj_court_changelog_{today}.json')


if __name__ == '__main__':
    main()
