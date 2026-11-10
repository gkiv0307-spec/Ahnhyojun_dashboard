#!/usr/bin/env python3
"""대시보드 스냅샷에서 '기일이 지났는데 결과가 안 들어간' 데일리 경매분석 카드를 뽑는다.

  python -I -X utf8 scripts/dash_pending.py <스냅샷 또는 Drive 다운로드 결과 파일> [--today 2026-11-02] [--limit N]

입력은 둘 중 하나다.
  - ahj_dashboard_snapshot.json (풀어 둔 JSON)
  - Drive download_file_content 가 저장한 결과 파일 ({"content": "<base64>", ...}; gzip 이면 푼다)

출력 data/dash-out/dash-pending.json — 카드마다 조회에 필요한 칸만 남긴다.
memo·주소·이름 같은 건 옮기지 않는다(실명이 섞일 수 있다).

고르는 기준(2026-11-02 사용자 지시 "대시보드에 들어가 있는 물건은 매일 결과 입력"):
  - 상태 조사중/입찰예정/유찰/변경 이고 saleDate 가 오늘보다 앞선 카드
  - 오늘 이미 법원 확인(courtCheckedAt == 오늘)한 카드는 뺀다
  - '변경' 카드는 새 기일이 안 잡히면 매일 같은 답이 나오므로 마지막 확인 뒤 7일이 지나야 다시 본다
  - 건수 상한 없음(2026-11-02 사용자 지시 "30건 한도 없이 싹 다"). 기일이 오래된 것부터.

카드 식별은 사건번호(+물건N)다. 물건번호가 없으면 1로 보되 임의로 '물건1' 을 붙이지 않는다.
"""
import argparse, base64, datetime, gzip, json, os, re, sys

OPEN = {'조사중', '입찰예정', '유찰', '변경'}
R_CASE = re.compile(r'(20\d{2}타경\d+)(?:\s*물건\s*(\d+))?')
R_GYE = re.compile(r'\s*(경매\s*)?\d+\s*계\s*$')
OUT = os.path.join('data', 'dash-out', 'dash-pending.json')


def kst_today():
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9)).date()


def load_snapshot(path):
    raw = open(path, 'rb').read()
    try:
        obj = json.loads(raw.decode('utf-8'))
    except Exception:
        obj = None
    if isinstance(obj, dict) and 'content' in obj and 'marketAuctions' not in obj:
        raw = base64.b64decode(obj['content'])
        obj = None
    if raw[:2] == b'\x1f\x8b':
        raw = gzip.decompress(raw)
    if obj is None:
        obj = json.loads(raw.decode('utf-8'))
    return obj


def court_option(court):
    """카드의 '대구서부지원 2계' → 법원경매정보 법원 선택값 '대구서부지원'.
    지원이 있으면 지원 이름만('창원지방법원 마산지원' → '마산지원')."""
    c = R_GYE.sub('', (court or '').strip())
    toks = c.split()
    for t in toks:
        if t.endswith('지원'):
            return t
    return toks[0] if toks else ''


def pick(ma, today, limit):
    out = []
    for m in ma:
        if m.get('status') not in OPEN:
            continue
        sd = (m.get('saleDate') or '')[:10]
        if not sd or sd >= today.isoformat():
            continue
        chk = (m.get('courtCheckedAt') or '')[:10]
        if chk == today.isoformat():
            continue
        if m.get('status') == '변경' and chk:
            try:
                if (today - datetime.date.fromisoformat(chk)).days < 7:
                    continue
            except ValueError:
                pass
        mt = R_CASE.match((m.get('caseNumber') or '').strip())
        if not mt:
            continue
        out.append({
            'id': m.get('id'), 'caseNumber': m.get('caseNumber'),
            'caNo': mt.group(1), 'ino': int(mt.group(2) or 1), 'hasIno': bool(mt.group(2)),
            'buildingName': re.sub(r'^🔄\S+\s*', '', m.get('buildingName') or ''),
            'court': m.get('court') or '', 'ctOpt': court_option(m.get('court')),
            'region': m.get('region') or '',
            'status': m.get('status'), 'saleDate': sd,
            'minSalePrice': m.get('minSalePrice'), 'appraisalValue': m.get('appraisalValue'),
            'failCount': m.get('failCount') or 0, 'winningBid': m.get('winningBid') or 0,
            'courtCheckedAt': chk or None,
        })
    out.sort(key=lambda c: (c['saleDate'], c['caNo'], c['ino']))
    return out[:limit], len(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('--today', default=None)
    ap.add_argument("--limit", type=int, default=1000)
    ap.add_argument('--out', default=OUT)
    a = ap.parse_args()
    today = datetime.date.fromisoformat(a.today) if a.today else kst_today()
    snap = load_snapshot(a.src)
    ma = snap.get('marketAuctions') or []
    items, total = pick(ma, today, a.limit)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump({'date': today.isoformat(), 'snapshotCards': len(ma), 'pendingTotal': total, 'items': items},
              open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'카드 {len(ma)}장 · 기일 지남·결과 미입력 {total}건 → 오늘 조회 {len(items)}건 ({a.out})')
    for c in items:
        print(f"  {c['ctOpt'] or '?':<8} {c['caseNumber']:<22} {c['buildingName'][:14]:<14} "
              f"{c['status']} 기일 {c['saleDate']} 최저 {c['minSalePrice'] or 0:,} 유찰 {c['failCount']}"
              + (f" 확인 {c['courtCheckedAt']}" if c['courtCheckedAt'] else ''))


if __name__ == '__main__':
    main()
