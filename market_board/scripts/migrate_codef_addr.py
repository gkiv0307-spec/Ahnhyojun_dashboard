#!/usr/bin/env python3
"""보드에 남아 있는 CODEF `addr` 를 보드 주소 필드로 옮긴다 (일회성).

  python3 scripts/migrate_codef_addr.py --dry
  python3 scripts/migrate_codef_addr.py --write

apply_codef 가 CODEF 의 물건별 소재지를 `addr` 로 받아 놓고 보드가 읽는
`a` 로 옮기지 않았다. 그래서 **주소를 아는 물건이 화면에 '소재지 미색인'
으로 나왔고**, 지역 필터·지도·시세 매칭에서도 빠졌다.

CODEF 주소가 색인 주소보다 낫다 — 지번과 호수가 다 들어 있다. 색인 쪽은
'(호수 미색인)' '(상세주소 미색인)' 으로 끝나는 게 흔하다. 그래서 둘 다
있으면 CODEF 쪽을 쓴다. 표본 99건 중 94건이 달랐고 전부 CODEF 가 상세했다.

돌린 뒤 attach_rtms → screen_clean → build_site 를 이어서 돌려라.
주소가 바뀌면 시세 매칭이 달라진다.
"""
import json, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

# apply_codef 의 변환기를 그대로 쓴다 — 규칙을 두 벌 두면 반드시 어긋난다.
import importlib.util, types
_src = (pathlib.Path(__file__).resolve().parent / 'apply_codef.py').read_text(encoding='utf-8')
_head = _src[:_src.index('stat = Counter()')]
_mod = types.ModuleType('ac_head')
_mod.__dict__['__name__'] = 'ac_head'
exec(compile(_head.replace("D = json.load(open('data/data.json'))", "D = []")
                  .replace("C = json.load(open('data/cars.json'))", "C = []"),
             'apply_codef.py(head)', 'exec'), _mod.__dict__)
board_addr = _mod.board_addr

ROOT = pathlib.Path(__file__).resolve().parent.parent
write = '--write' in sys.argv


def run(path):
    D = json.loads((ROOT / path).read_text(encoding='utf-8'))
    fill = fix = drop = skip = 0
    for x in D:
        raw = x.pop('addr', None)
        if raw is None:
            continue
        drop += 1
        a, a1, a2, r = board_addr(raw)
        if not a:
            skip += 1; continue
        if not x.get('a'):
            fill += 1
        elif x['a'] != a:
            fix += 1
        else:
            continue
        x['a'] = a
        if a1: x['a1'] = a1
        if a2: x['a2'] = a2
        if r: x.setdefault('r', r)
        # CODEF 원본 주소는 잘리지 않았다.
        x.pop('addrCut', None)
    print(f'{path}: addr 제거 {drop} · 주소 채움 {fill} · 주소 교체 {fix} · 못 읽음 {skip}')
    if write:
        (ROOT / path).write_text(json.dumps(D, ensure_ascii=False), encoding='utf-8')
    return D


for p in ('data/data.json', 'data/cars.json'):
    run(p)
print('저장함' if write else '미리보기 — 저장하려면 --write')
