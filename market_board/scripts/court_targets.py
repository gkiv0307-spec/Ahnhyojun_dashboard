#!/usr/bin/env python3
"""PC 세션(Claude in Chrome)이 매일 아침 법원경매정보에서 무엇을 볼지 정해 준다.

  scripts/court_targets.py            # 오늘 할 일을 사람이 읽는 꼴로
  scripts/court_targets.py --json     # 같은 내용을 JSON 으로

2026-10-07 사용자 지시: "경매정보검색을 해서 전국 대장단지, 대구권 집중해서 경매물건 찾아줘서
대시보드 데일리경매분석으로 자동추출되고 매일 오전 매각 변경 취하 등등 표시까지 자동으로".

조회는 클라우드에서 하지 않는다(법원이 서버 IP를 막는다). 이 스크립트는 목록만 만든다.
PC 세션이 읽은 결과는 data/court-in/<날짜>-pc.json 으로 커밋하고, 06시 클라우드 루틴의
apply_court.py 가 반영한다(새 물건은 "new" 블록 — apply_court.py 맨 위 설명).

  ① 결과 확인: 대시보드에 보낸 물건 중 기일이 지났는데 결과를 모르는 것을 모두,
     그다음 대구권 진행중 물건 중 기일이 지난 것을 최근 기일부터 — 합쳐 STATUS_MAX 사건.
  ② 새 물건 검색: 대구권(대구 전 구·군 + 경산·칠곡)은 매일, 그 밖의 시·도는 하루 2곳씩 돌아가며.
     매각기일 오늘+3일 ~ 오늘+45일, 용도 아파트. 대구권은 아파트 전부, 그 밖은 대장 단지만 연다.
하루 페이지 조회는 PAGE_BUDGET 이내로 — 사람이 보듯 천천히(규칙: 하루 수십 건).
"""
import argparse, datetime, json, re

_KST = datetime.timezone(datetime.timedelta(hours=9))
STATUS_MAX = 20
PAGE_BUDGET = 60
WINDOW = (3, 45)
DAEGU_SEARCH = [('대구광역시', None), ('경상북도', '경산시'), ('경상북도', '칠곡군')]
SIDO_FULL = {'서울': '서울특별시', '경기': '경기도', '인천': '인천광역시', '부산': '부산광역시',
             '대전': '대전광역시', '세종': '세종특별자치시', '광주': '광주광역시', '울산': '울산광역시',
             '경북': '경상북도', '경남': '경상남도', '충북': '충청북도', '충남': '충청남도',
             '전북': '전북특별자치도', '전남': '전라남도', '강원': '강원특별자치도', '제주': '제주특별자치도'}
ROTATION = ['서울', '경기', '부산', '경북', '경남', '인천', '대전', '울산', '광주', '충북',
            '충남', '세종', '전북', '전남', '강원', '제주']


def plan(today):
    D = json.load(open('data/data.json', encoding='utf-8'))
    S = json.load(open('data/dash-sent.json', encoding='utf-8'))
    L = json.load(open('data/landmarks.json', encoding='utf-8'))
    t = today.isoformat()
    by = {(x.get('ct'), x.get('caNo'), x.get('ino') or 1): x for x in D}

    def pending(x):
        # 기일이 지났는데 결과를 모르는 물건. 그 기일 뒤에 법원에서 이미 확인했으면 뺀다.
        d = x.get('d') or ''
        return (x.get('st') == '진행중' and d and d < t
                and (x.get('stAt') or '') <= d)

    # 사용자가 대시보드에서 지운 사건(removed)은 다시 보지도, 새로 넣지도 않는다.
    removed = set()
    for r in S.get('removed') or []:
        removed.update(r.get('caNos') or [] if isinstance(r, dict) else [r])
    status, seen = [], set()
    for i in S.get('items') or []:
        key = (i.get('ct'), i.get('caNo'), i.get('ino') or 1)
        x = by.get(key)
        if x and pending(x) and key[1] not in removed and key[:2] not in seen:
            seen.add(key[:2])
            status.append({'ct': key[0], 'caNo': key[1], 'd': x['d'], 'why': '대시보드',
                           'a': x.get('a', '')[:40]})
    rest = sorted((x for x in D if x.get('r') == '대구' and pending(x)
                   and (x.get('ct'), x.get('caNo')) not in seen and x.get('caNo') not in removed),
                  key=lambda x: x['d'], reverse=True)
    for x in rest:
        if len(status) >= STATUS_MAX:
            break
        if (x.get('ct'), x.get('caNo')) in seen:
            continue
        seen.add((x.get('ct'), x.get('caNo')))
        status.append({'ct': x['ct'], 'caNo': x['caNo'], 'd': x['d'], 'why': '대구권 기일 경과',
                       'a': x.get('a', '')[:40]})

    k = today.toordinal() % len(ROTATION)
    today_regions = [ROTATION[k], ROTATION[(k + 1) % len(ROTATION)]]
    search = [{'sido': s, 'sigungu': g, 'open': '아파트 전부(대구권)'} for s, g in DAEGU_SEARCH]
    for r in today_regions:
        search.append({'sido': SIDO_FULL[r], 'sigungu': None, 'open': '대장 단지만',
                       'landmarks': [n for n in L.get(r) or [] if n]})
    # 이미 법원 확인을 마친 진행중 사건은 다시 열지 않는다(목록에서 사건번호만 대조).
    known = sorted({x['caNo'] for x in D
                    if x.get('verified') and x.get('st') == '진행중' and (x.get('d') or '') >= t})
    lo, hi = (today + datetime.timedelta(days=d) for d in WINDOW)
    return {'today': t, 'status': status, 'search': search,
            'window': [lo.isoformat(), hi.isoformat()], 'skip_known': known,
            'skip_removed': sorted(removed),
            'daegu_landmarks': L.get('대구') or [], 'page_budget': PAGE_BUDGET}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--date', help='YYYY-MM-DD (기본 오늘 KST)')
    a = ap.parse_args()
    today = (datetime.date.fromisoformat(a.date) if a.date
             else datetime.datetime.now(_KST).date())
    p = plan(today)
    if a.json:
        print(json.dumps(p, ensure_ascii=False, indent=1))
        return
    print(f'══ {p["today"]} 법원경매정보 할 일 (페이지 {p["page_budget"]}회 이내) ══')
    print(f'① 결과 확인 {len(p["status"])}사건 — 사건검색 → 기일내역·종국결과')
    for s in p['status']:
        print(f'   {s["ct"]} {s["caNo"]}  기일 {s["d"]}  ({s["why"]}) {s["a"]}')
    print(f'② 새 물건 검색 — 물건상세검색 · 용도 아파트 · 매각기일 {p["window"][0]} ~ {p["window"][1]}')
    for s in p['search']:
        where = s['sido'] + (f' {s["sigungu"]}' if s['sigungu'] else '')
        extra = f' · 대장 {len(s.get("landmarks") or [])}곳 명부' if s.get('landmarks') else ''
        print(f'   {where} — {s["open"]}{extra}')
    print(f'   이미 법원 확인한 진행중 사건 {len(p["skip_known"])}건은 열지 않는다 (--json 의 skip_known)')
    print(f'   사용자가 대시보드에서 지운 사건 {len(p["skip_removed"])}건은 넣지 않는다 (skip_removed)')


if __name__ == '__main__':
    main()
