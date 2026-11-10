#!/usr/bin/env python3
"""법원경매정보 화면에서 읽은 한 사건의 기일내역을 data/court-in/<오늘>.json 에 더한다.

  python -I -X utf8 scripts/courtin_add.py --ct 대구지방법원 --ca 2026타경1062 \
      --ld 2026-10-01,269000000,유찰 --ld 2026-10-27,188300000,매각,235150000

  --ld  "날짜,최저가,결과[,낙찰가]"  — 기일내역 표의 행을 처음부터 끝까지 전부. 아직 안 열린 기일은 결과를 비운다
        (예: --ld 2026-11-25,385700000,)
  --ino 물건번호(기본 1)   --stay 집행정지   --final 취하 --final-at 2026-10-20   --hold
  --partial  기일내역을 끝까지 못 읽었으면(full:false)

같은 (법원, 사건번호, 물건번호) 가 이미 있으면 덮어쓴다. 실명은 어떤 칸에도 넣지 않는다.
파일 형식은 scripts/apply_court.py 맨 위 설명과 같다.
"""
import argparse, datetime, json, os

IN_DIR = os.path.join('data', 'court-in')


def kst_today():
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9)).date().isoformat()


def parse_ld(s):
    p = [t.strip() for t in s.split(',')]
    if len(p) < 3:
        raise SystemExit(f'--ld 형식 오류: {s!r} (날짜,최저가,결과[,낙찰가])')
    row = {'d': p[0], 'amt': int(p[1].replace('원', '') or 0), 'res': p[2] or None}
    datetime.date.fromisoformat(row['d'])
    if len(p) > 3 and p[3]:
        row['winBid'] = int(p[3].replace('원', ''))
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ct', required=True)
    ap.add_argument('--ca', required=True)
    ap.add_argument('--ino', type=int, default=1)
    ap.add_argument('--ld', action='append', default=[])
    ap.add_argument('--stay', default=None)
    ap.add_argument('--final', default=None)
    ap.add_argument('--final-at', default=None)
    ap.add_argument('--hold', action='store_true')
    ap.add_argument('--partial', action='store_true')
    ap.add_argument('--date', default=None, help='court-in 파일 날짜(기본 오늘 KST)')
    a = ap.parse_args()
    day = a.date or kst_today()
    path = os.path.join(IN_DIR, f'{day}.json')
    doc = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {'checkedAt': day, 'items': []}
    item = {'ct': a.ct, 'caNo': a.ca, 'ino': a.ino, 'final': a.final, 'finalAt': a.final_at,
            'full': not a.partial, 'hold': a.hold,
            'ld': sorted((parse_ld(s) for s in a.ld), key=lambda r: r['d'])}
    if a.stay:
        item['stay'] = a.stay
    items = [x for x in doc['items'] if (x.get('ct'), x.get('caNo'), x.get('ino') or 1) != (a.ct, a.ca, a.ino)]
    replaced = len(items) != len(doc['items'])
    items.append(item)
    doc['items'] = items
    os.makedirs(IN_DIR, exist_ok=True)
    json.dump(doc, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"{'덮어씀' if replaced else '추가'} {a.ct} {a.ca}[{a.ino}] 기일 {len(item['ld'])}행 → {path} (총 {len(items)}건)")


if __name__ == '__main__':
    main()
