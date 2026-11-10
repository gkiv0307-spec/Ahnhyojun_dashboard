#!/usr/bin/env python3
"""codef-queue.json 을 data.json · cars.json 에서 다시 만든다.

  scripts/build_queue.py            # 큐 미리보기
  scripts/build_queue.py --write    # codef-queue.json 에 쓴다

**손으로 고치지 마라.** 어제 부른 사건이 큐에 남아 있으면 오늘 한도를
그 사건에 다시 쓴다. 매일 갱신 끝에 이걸 돌려서 큐를 새로 굽는다.

담는 기준은 둘이다. **법원 원본으로 아직 대조하지 않은 물건**(verified
아님)과, 대조는 했지만 **다시 봐야 할 사유가 생긴 물건**(매각기일이 지났다,
대시보드에 보낸 물건의 기일이 내일이다 — 아래 _recheck_tier). 색인만 보고
담은 물건은 진행상태도 기일도 확실하지 않고, 대조한 물건도 기일이 지나면
유찰·매각 결과가 새로 생긴다.

이미 끝난 사건은 뺀다. 종료·취하된 사건을 다시 물어봐야 하루 100건짜리
한도만 축낸다. 다만 '미확인' 은 뺄 근거가 없으므로 남긴다 — 확인하려고
큐에 넣는 것이다.

순서는 최근 사건부터다. 한도가 100건이라 큐 뒤쪽은 오늘 안 불린다.
뒤로 밀리는 쪽이 오래된 사건이어야 한다.
"""
import argparse, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DONE = {'종료', '취하', '기각', '각하', '배당종결', '취소'}
NOTE = ('CODEF 대조 대기열. 부동산은 data.json, 자동차는 cars.json 에 산다 — '
        '큐에는 둘이 섞여 있으니 어느 한쪽에만 없다고 고아로 보고 버리지 마라. '
        'scripts/build_queue.py 가 매일 다시 굽는다. 손으로 고치지 마라.')


def rank(it):
    """최근 사건 먼저, 그다음 대구권 먼저. tier 가 앞에 붙는다."""
    m = re.match(r'(\d{4})타경(\d+)', it['caNo'] or '')
    year, num = (int(m.group(1)), int(m.group(2))) if m else (0, 0)
    return (it.get('tier', 9), -year, 0 if it.get('region') == '대구' else 1, -num)


# ── 재대조 규칙 (2026-09-08, 사용자 요청: 유찰·변경·취하를 사람이 안 눌러도
#    대시보드에 자동 반영) ──────────────────────────────────────────────
# 한 번 대조한 물건도 아래 조건이면 다시 부른다. 순서(tier)가 곧 한도 배분이다.
#   0  대시보드에 보낸 물건 — 기일이 지났거나 내일이다(변경·취하를 전날 잡는다)
#   1  아직 대조 안 한 신규 발굴(예전 규칙 그대로)
#   2  대구권 진행중인데 매각기일이 지났다 → 유찰/매각 결과가 나와 있다
#   3  대구권 진행중인데 기일을 모르고 14일 넘게 안 봤다 → 감정·기일이 붙었는지
#   4  타 지역 진행중, 기일 경과
# 기일 당일은 안 부른다 — 법원이 결과를 그날 오후에 올리므로 다음 날 06시가 맞다.
_RECHECK_STALE_DAYS = 14


def _recheck_tier(x, today, sent_keys):
    if x.get('st') != '진행중' or not x.get('verified'):
        return None
    k = f'ct-{x.get("caNo")}-{x.get("ino") or 1}'
    d = x.get('d')
    dd = None
    if d:
        try:
            dd = _dt.date.fromisoformat(d)
        except ValueError:
            dd = None
    # 유찰됐는데 다음 기일이 아직 안 잡힌 물건은 지난 기일이 그대로 남는다.
    # 그걸 매일 다시 부르면 한도만 탄다 — 마지막 대조 뒤 며칠은 쉰다.
    va = x.get('verifiedAt') or ''
    try:
        age = (today - _dt.date.fromisoformat(va[:10])).days
    except ValueError:
        age = 999
    # 2026-09-09: 전날 기일 31건을 다음 날 06시에 물었더니 30건이 아직 결과 없이
    # 왔다(법원→CODEF 반영이 하루쯤 늦다). 그래서 지난 기일은 이틀 간격으로,
    # 대시보드 전송분은 매일 다시 본다 — 결과가 붙을 때까지.
    if k in sent_keys and dd and (dd < today or dd == today + _dt.timedelta(days=1)):
        if dd < today and age < 1:
            return None
        return 0, ('기일 경과 — 결과 반영' if dd < today else '내일 기일 — 변경·취하 확인') + ' (대시보드 전송분)'
    dg = x.get('r') == '대구'
    if dd and dd < today:
        if age < 2:
            return None
        return (2 if dg else 4), f'기일 {d} 경과 — 유찰·매각 결과 반영'
    if dg and not dd:
        if age >= _RECHECK_STALE_DAYS:
            return 3, f'기일 미정, 마지막 대조 {va[:10] or "?"} — 감정·기일 확인'
    return None


import datetime as _dt


def main():
    a = argparse.ArgumentParser()
    a.add_argument('--write', action='store_true')
    a = a.parse_args()

    # 컨테이너 시계는 UTC 다. 한도도 갱신도 KST 기준이라 날짜를 KST 로 적는다.
    today_d = (_dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=9)).date()
    today = today_d.strftime('%Y-%m-%d')
    sent_p = ROOT / 'data' / 'dash-sent.json'
    sent_keys = set()
    if sent_p.exists():
        sent_keys = {i['key'] for i in json.loads(sent_p.read_text(encoding='utf-8')).get('items', [])}

    items, seen = [], set()
    from collections import Counter
    tiers = Counter()
    for fn, why in (('data.json', '나이스옥션 색인 발굴 — 진행상태·기일 미확인. 법원 원본 대조 전입니다'),
                    ('cars.json', '자동차 물건 — 법원 원본 대조 전입니다')):
        for x in json.loads((ROOT / 'data' / fn).read_text(encoding='utf-8')):
            if x.get('st') in DONE or not x.get('caNo'):
                continue
            k = (x.get('ct'), x['caNo'], x.get('ino') or 1)
            if k in seen:
                continue
            if x.get('verified'):
                rc = _recheck_tier(x, today_d, sent_keys)
                if not rc:
                    continue
                tier, why_x = rc
            else:
                tier, why_x = 1, (x.get('note') or why)
            seen.add(k)
            tiers[tier] += 1
            items.append({'court': x.get('ct'), 'caNo': x['caNo'], 'ino': x.get('ino') or 1,
                          'addr': x.get('a') or x.get('name') or '', 'region': x.get('r'),
                          'tier': tier, 'why': why_x})

    items.sort(key=rank)
    print('  tier: ' + ' · '.join(f'{t}={tiers[t]}' for t in sorted(tiers))
          + '  (0 대시보드 전송분 · 1 신규 · 2 대구 기일경과 · 3 대구 기일미정 14일+ · 4 타지역 기일경과)')
    old = json.loads((ROOT / 'codef-queue.json').read_text(encoding='utf-8'))
    Q = {'generatedAt': today,
         'note': NOTE, 'total': len(items), 'items': items,
         # 전방 스캔 메모는 사람이 관리한다. 덮어쓰지 않는다.
         'scanFrontier': old.get('scanFrontier', {}),
         'indexFrontier': old.get('indexFrontier', {}), 'carryOver': []}
    cases = len({(i['court'], i['caNo']) for i in items})
    print(f'큐 {len(items)}물건 · {cases}사건 (이전 {old.get("total")}물건)')
    print('  상위 5: ' + ' · '.join(f'{i["court"]} {i["caNo"]}' for i in items[:5]))
    if a.write:
        (ROOT / 'codef-queue.json').write_text(
            json.dumps(Q, ensure_ascii=False, indent=1), encoding='utf-8')
        print('저장 codef-queue.json')


if __name__ == '__main__':
    main()
