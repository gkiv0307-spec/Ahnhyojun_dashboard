#!/usr/bin/env python3
"""CODEF 응답 묶음을 보드에 반영하고 원본을 data/codef-raw/ 에 보관한다.

  scripts/apply_codef.py <응답디렉터리>     # 기본 /tmp/na/raw

파일명은 `법원_사건번호.json` 이어야 한다 — 법원명을 거기서 읽는다.
CF-12100(없는 사건)은 건너뛰고, CF-00000 만 반영한다.

CODEF 가 주지 않는 필드(건축물대장 br, 시세 mk, 색인 면적 ar)는 기존 값을
남긴다. 나머지는 CODEF 를 정답으로 덮는다.

돌린 뒤에는 반드시 `scripts/mask_names.py`, `scripts/attach_rtms.py`,
`scripts/screen_clean.py` 를 이어서 돌려라. 보관본에는 매각물건명세서 비고의
실명이 그대로 들어 있고, 용도가 바뀌면 시세 매칭도 달라진다. 그리고 CODEF 가
특이사항·유찰횟수를 새로 채워 주므로 선별 등급을 다시 매겨야 한다 — 안 그러면
유치권이 붙은 물건이 계속 '권리 자국 없음' 으로 남는다.
"""
import glob, json, os, pathlib, re, subprocess, sys, datetime
from collections import Counter
sys.path.insert(0, 'scripts')
from codef_to_board import parse, _FINAL_CLOSED

# 컨테이너 시계는 UTC다. 08시 KST 실행은 UTC로 전날이라 date.today() 를
# 그대로 쓰면 검증일이 하루 전으로 찍힌다. CODEF 카운터와 같은 함정이다.
_KST = datetime.timezone(datetime.timedelta(hours=9))
TODAY = datetime.datetime.now(_KST).date().isoformat()
D = json.load(open('data/data.json'))
C = json.load(open('data/cars.json'))
idx = {(x.get('ct'), x.get('caNo'), x.get('ino') or 1): x for x in D}
# 자동차는 data.json 이 아니라 cars.json 에 산다. 이 색인이 없으면 검증된
# 자동차가 부동산 보드에 새 물건으로 append 된다 — 이미 한 번 겪은 사고다.
cidx = {(x.get('ct'), x.get('caNo'), x.get('ino') or 1): x for x in C}

# 용도로 자동차를 가른다. 표기가 셋으로 갈린다.
_CAR = ('승용차', '자동차', '중기', '차량', '이륜')


def is_car(it, key):
    """자동차·중기인가. cars.json 에 이미 있으면 그것만으로 확정한다."""
    if key in cidx:
        return True
    u = it.get('ut') or ''
    return any(w in u for w in _CAR)


# ── CODEF 주소를 보드 주소로 ───────────────────────────────────────
# CODEF 는 물건별 소재지를 resInventoryList 에서 주고 parse() 가 `addr` 로
# 넘긴다. 보드가 읽는 필드는 `a` 다. 이걸 옮겨 적지 않아서 **주소를 아는
# 물건 140건이 화면에 '소재지 미색인' 으로 나오고 있었다**(2026-09-04 확인).
# 지역 필터·지도·시세 매칭도 같이 죽어 있었다.
#
# 보드의 `a` 는 시·도를 뗀 형태다('수성구 범어동 …'). 시·도는 `r` 이 든다.
# split_addr 은 시·도가 붙은 전체 주소를 받아야 하므로 순서를 지켜라.
from parse_auction import split_addr, SIDO as _SIDO_RE

_SIDO_R = {
    '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구',
    '인천광역시': '인천', '광주광역시': '광주', '대전광역시': '대전',
    '울산광역시': '울산', '세종특별자치시': '세종', '경기도': '경기',
    '강원도': '강원', '강원특별자치도': '강원', '충청북도': '충북',
    '충청남도': '충남', '전라북도': '전북', '전북특별자치도': '전북',
    '전라남도': '전남', '경상북도': '경북', '경상남도': '경남',
    '제주특별자치도': '제주',
}


_SHORT = {'서울': '서울특별시', '부산': '부산광역시', '대구': '대구광역시',
          '인천': '인천광역시', '광주': '광주광역시', '대전': '대전광역시',
          '울산': '울산광역시', '세종': '세종특별자치시', '경기': '경기도',
          '강원': '강원특별자치도', '충북': '충청북도', '충남': '충청남도',
          '전북': '전북특별자치도', '전남': '전라남도',
          '경북': '경상북도', '경남': '경상남도', '제주': '제주특별자치도'}


def board_addr(addr):
    """CODEF 의 소재지 → (a, a1, a2, r). 못 읽으면 전부 None.

    **시·도로 시작하지 않는 주소는 통째로 버린다.** split_addr 은 시·도가
    붙어 있다고 보고 자르는데, '대구 수성구 …' 처럼 짧은 시·도로 오면
    '대구' 자체가 `^[가-힣]+[구군]$` 에 걸려 시군구로 들어간다. 자동차
    물건의 소재지 자리에는 차명이 오기도 한다('쏘나타(SONATA)').
    잘못 읽느니 안 읽는 게 낫다 — 그 물건은 기존 값을 그대로 쓴다.
    """
    if not addr:
        return None, None, None, None
    full = addr.strip()
    for short, long in _SHORT.items():           # '대구 수성구' → '대구광역시 수성구'
        if full.startswith(short + ' '):
            full = long + full[len(short):]
            break
    m = re.match(r'\s*' + _SIDO_RE, full)
    if not m:
        return None, None, None, None
    a1, a2 = split_addr(full)
    a = re.sub(r'^\s*' + _SIDO_RE + r'\s*', '', full).strip()
    return (a or None), a1, a2, _SIDO_R.get(m.group(0).strip())


stat = Counter()
archived = 0
SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/na/raw'
for path in sorted(glob.glob(os.path.join(SRC, '*.json'))):
    stat['파일'] += 1
    try:
        raw = json.load(open(path, encoding='utf-8'))
    except Exception:
        stat['오류'] += 1; continue
    code = (raw.get('result') or {}).get('code')
    if code == 'CF-12100':
        stat['사건없음'] += 1; continue
    if code != 'CF-00000':
        stat['오류'] += 1; continue

    court = os.path.basename(path).split('_')[0]
    # 원본 보관(result 는 떼고). mask_names.py 가 뒤에서 이름을 가린다.
    dst = pathlib.Path('data/codef-raw') / os.path.basename(path)
    dst.write_text(json.dumps({'data': raw.get('data')}, ensure_ascii=False), encoding='utf-8')
    archived += 1

    try:
        r = parse(raw)
    except Exception as e:
        stat['오류'] += 1; continue

    for it in r['items']:
        it['ct'] = court
        k = (court, it.get('caNo'), it.get('ino') or 1)
        it['verified'] = True
        it['verifiedAt'] = TODAY
        if is_car(it, k):
            # 자동차는 화면 필드가 다르다(name·plate·kind·loc). CODEF 가 주는
            # 상태·기일·금액만 갱신하고 나머지는 건드리지 않는다.
            car = cidx.get(k)
            if car:
                # 종결 사건은 resProductList 가 비어서 금액이 안 온다.
                # None 으로 덮으면 색인에서 얻어둔 감정가·최저가가 지워진다.
                for f in ('ap', 'mn', 'rt', 'f', 'd', 'ld', 'sp'):
                    if it.get(f) is not None:
                        car[f] = it[f]
                # 상태와 종국결과는 없는 것도 사실이므로 그대로 반영한다.
                for f in ('st', 'final', 'state'):
                    if f in it:
                        car[f] = it[f]
                car['verified'] = True
                car['verifiedAt'] = TODAY
                stat['자동차 갱신'] += 1
            else:
                stat['자동차 미등록'] += 1
            continue
        # CODEF 의 소재지를 보드 필드로 옮긴다. 이걸 안 해서 주소를 아는
        # 물건 140건이 '소재지 미색인' 으로 나오고 있었다.
        a, a1, a2, rr = board_addr(it.pop('addr', None))
        if a:
            it['a'], it['a1'], it['a2'] = a, a1, a2
            if rr:
                it.setdefault('r', rr)

        old = idx.get(k)
        if old:
            # **덮어쓸 필드를 나열한다. 남길 필드를 나열하지 않는다.**
            #
            # 예전에는 old 를 통째로 비우고 '남길 필드' 목록(KEEP)으로
            # 되살렸다. 그 방식은 새 필드를 만들 때마다 목록에 넣는 걸
            # 잊으면 조용히 지워진다 — 주소·시세, 용도, 말소기준등기가
            # 차례로 그렇게 날아갔다. 그래서 뒤집었다. **여기 없는 필드는
            # 손대지 않는다.** 새 출처가 필드를 늘려도 안전하다.
            #
            # HARD : CODEF 가 소유한다. 안 준 것도 사실이므로 그대로 반영.
            # SOFT : CODEF 가 값을 줄 때만 정답. 종결 사건은 물건 목록이
            #        비어 오므로, 없다고 덮으면 알던 값이 지워진다.
            # CODEF 가 '결과 미게시' 로 주는 기일이라도, 우리가 이미 그날의
            # 결과를 알고 있으면 지우지 않는다. 없다는 것은 데이터가 아니라
            # **데이터의 부재**다. 2026-09-19 에 사용자가 알려 준 2026타경3134·
            # 2025타경32082 의 9/17 유찰이 이 덮어쓰기로 통째로 날아갔다
            # (유찰 1회 → 0회, 기일 미정 → 지난 기일 재등장).
            if it.get('ld') and old.get('ld'):
                known = {e.get('d'): e.get('res') for e in old['ld'] if e.get('res')}
                kept = False
                for e in it['ld']:
                    if not e.get('res') and known.get(e.get('d')):
                        e['res'] = known[e['d']]
                        kept = True
                if kept:
                    # 사다리를 손봤으면 유찰 횟수와 '다음 기일' 도 다시 센다.
                    # 안 그러면 CODEF 가 준 0회·지난 기일이 그대로 남는다.
                    it['f'] = sum(1 for e in it['ld'] if '유찰' in str(e.get('res') or ''))
                    nxt = [e.get('d') for e in it['ld'] if not e.get('res')]
                    it['d'] = nxt[0] if nxt else None
                    # d 를 비우려면 SOFT 로는 안 된다(빈 값은 건너뛴다).
                    if it['d'] is None:
                        old.pop('d', None)

            HARD = ('st', 'final', 'state', 'resultDesc', 'prodNote',
                    'receipt', 'closedAt', 'caseName', 'merger', 'multi',
                    'caNo', 'ino', 'ct', 'verified', 'verifiedAt')
            SOFT = ('ap', 'mn', 'rt', 'ut', 'd', 'f', 'ld', 'sp', 'claim',
                    'a', 'a1', 'a2', 'r')
            idx_st = old.get('st') if old.get('stSrc') == 'idx' else None
            for f in HARD:
                if f in it:
                    old[f] = it[f]
            # 검색 색인으로 매각·종료를 확인해 둔 물건(index_recheck.py)에 CODEF 가
            # '진행중' 을 주면 결과 미게시다(법원→CODEF 반영이 며칠 늦다 — 2026-09-24
            # 실측 5건). 없다는 것은 데이터가 아니다. 그 밖에는 CODEF 가 정답이다.
            if idx_st in ('매각', '종료') and old.get('st') == '진행중':
                old['st'] = idx_st
            else:
                for f in ('stSrc', 'stAt', 'stBy'):
                    old.pop(f, None)
            for f in SOFT:
                if it.get(f) not in (None, '', []):
                    old[f] = it[f]
            # CODEF 가 용도를 확정했으면 추정 표시를 뗀다.
            if it.get('ut'):
                old['utGuess'] = False
            old.pop('mnApprox', None)
            old.pop('addr', None)
            it = old
            stat['갱신'] += 1
        else:
            D.append(it); idx[k] = it
            stat['신규'] += 1
        if it.get('st') == '종료':
            stat['종료'] += 1
        elif it.get('st') == '매각':
            stat['매각'] += 1

    # 사건이 끝났으면(배당종결·취하·기각…) 그 사건의 모든 물건이 끝난 것이다.
    # 종결 사건은 물건 목록이 비어 와서 parse 가 물건 1 하나만 돌려주므로,
    # 물건 2 이하는 위 루프가 못 건드린다. 2026-09-07 에 그렇게 물건 2가
    # '미확인' 으로 남아 다음 날 큐에 다시 올라 한도를 한 번 더 썼다.
    # 여기서는 상태·종국 필드만 적고 금액·주소는 손대지 않는다.
    final = (r.get('final') or '').strip()
    if final and any(k in final for k in _FINAL_CLOSED):
        touched = {(court, it.get('caNo'), it.get('ino') or 1) for it in r['items']}
        for x in D:
            k = (x.get('ct'), x.get('caNo'), x.get('ino') or 1)
            if k[0] == court and k[1] == r.get('caNo') and k not in touched \
                    and x.get('st') != '종료':
                x['st'] = '종료'
                x['final'] = final
                if r.get('closedAt'):
                    x['closedAt'] = r['closedAt']
                x['verified'] = True
                x['verifiedAt'] = TODAY
                stat['사건 종결로 같이 종료'] += 1

# 발굴 안내문('법원 원본 대조 전입니다')은 대조가 끝나면 거짓말이 된다 — 검증된
# 물건에서는 지운다. 2026-09-12 에 검증 완료 228건이 그 문구를 달고 있었다.
_items = D['items'] if isinstance(D, dict) and 'items' in D else D
_stale = 0
for _x in _items:
    if _x.get('verified') and '대조 전' in (_x.get('note') or ''):
        _x.pop('note', None); _stale += 1
if _stale:
    print(f'검증 완료 물건의 발굴 안내문 제거 {_stale}건')
json.dump(D, open('data/data.json', 'w'), ensure_ascii=False)
json.dump(C, open('data/cars.json', 'w'), ensure_ascii=False)
print(f'보관 {archived}건 · ' + ' · '.join(f'{k} {v}' for k, v in stat.items()))
print(f'보드 {len(D)}건')
