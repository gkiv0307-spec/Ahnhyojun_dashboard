#!/usr/bin/env python3
"""데일리 경매분석(대시보드)에 보낸 물건의 변동을 갱신 파일로 만든다.

  scripts/dash_sync.py            # 미리보기 — 무엇이 바뀌었는지만 찍는다
  scripts/dash_sync.py --write    # 갱신 파일을 쓰고 data/dash-sent.json 의 last 를 올린다

**반드시 apply_codef.py 뒤에 돌린다.** CODEF 가 유찰·변경·매각·종결을 새로 채운
다음이어야 비교할 새 값이 있다.

대시보드는 Google Drive 백업 폴더의 ahj_market_chunk_*.json 을 읽어 같은
사건번호면 갱신한다. 이 스크립트는 그 파일의 *내용* 만 만든다 — Drive 에
올리는 건 세션이 Google Drive 도구(create_file)로 한다. 서버에는 Drive
자격증명이 없고, 있어도 여기 두지 않는다.

출력: <out>/dash-update-<날짜>.json (갱신할 물건 배열, 대시보드 형식 그대로)
      <out>/dash-update-<날짜>.title (Drive 에 올릴 때 쓸 파일 이름)

바뀐 것으로 보는 필드: st(상태) · d(매각기일) · mn(최저가) · f(유찰 횟수).
사용자가 대시보드에서 손으로 바꾼 상태는 여기서 알 수 없으므로, 우리가
마지막으로 보낸 status 를 그대로 다시 보낸다. 매각·종료만 status 를 바꾼다.
"""
import argparse, datetime, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SENT = ROOT / 'data' / 'dash-sent.json'


# 자동 등록 선별 기준 (2026-09-22 사용자 지시). 사용자가 직접 고른 물건에는
# 적용하지 않는다 — 자동으로 밀어 넣는 것에만 거는 문턱이다.
AUTO_MAX_AREA = 95.0     # 전용 ㎡. 84형(34~36평형)까지. 대형평형은 투자 수요가 얇다
AUTO_WINDOW_DAYS = None  # 대구 밖 기일 상한. 2026-10-07 사용자 지시로 없앰 — '14일 이상이 되어도 상관없어, 남은 기간별로 저장하고 있어서'
AUTO_DAEGU_MIN_DAYS = 10  # 대구 자동 등록: 매각기일이 오늘+이 날 이후인 것 (2026-09-28 지시, 촬영·글 쓸 시간)


def kst_today():
    return (datetime.datetime.now(datetime.timezone.utc)
            + datetime.timedelta(hours=9)).date()


def prop_type(ut):
    s = ut or ''
    for pat, v in (('아파트', '아파트'), ('오피스텔', '오피스텔'),
                   ('다세대|연립|빌라', '다세대·연립'), ('단독|다가구', '단독·다가구'),
                   ('상가|근린|점포', '상가'), ('공장', '공장'),
                   ('토지|대지|임야|전답|농지', '토지')):
        if re.search(pat, s):
            return v
    return '기타'


def won(n):
    if not n:
        return '-'
    uk, man = divmod(int(n) // 10000, 10000)
    return (f'{uk}억 ' if uk else '') + (f'{man:,}만' if man else '').strip() or f'{uk}억'


def dash_item(x, last, today, change):
    """대시보드 레코드. site-pages.js 의 dashItem() 과 같은 모양이어야 한다."""
    sp = [s for s in (x.get('sp') or []) if s]
    st = x.get('st')
    status = last.get('status') or '조사중'
    if st == '매각':
        status = '매각'
    elif st == '종료':
        status = '종료'
    memo = [f'현황판 자동 갱신 ({today}) — {change}']
    if sp:
        memo.append('특이사항 ' + ', '.join(sp))
    if x.get('final'):
        memo.append(f'종국결과 {x["final"]}')
    # 법원경매정보를 직접 읽은 결과(apply_court.py)는 그렇다고 적는다.
    if x.get('stSrc') == 'court':
        # 누가 법원 화면을 읽었는지 그대로 밝힌다(PC 크롬·대시보드 조회·ChatGPT 검색).
        memo.append(f'출처 {x.get("stBy") or "법원경매정보"} 확인({x.get("stAt") or "?"})')
        if x.get('winBid') and st == '매각':
            memo.append('낙찰가 ' + won(x['winBid']))
    # 검색 색인으로 확인한 결과(index_recheck.py)는 법원 원본이 아니다. 그렇다고 적는다.
    if x.get('stSrc') == 'idx':
        memo.append(f'출처 검색 색인({x.get("stBy") or "?"}·{x.get("stAt") or "?"}) — 법원 원본 아님')
        if x.get('winBid'):
            memo.append(('낙찰가 ≈ ' if x.get('winBidApprox') else '낙찰가 ') + won(x['winBid'])
                        + (' (만원 단위 반올림)' if x.get('winBidApprox') else ''))
    bld = ((x.get('br') or {}).get('bld') or (x.get('tx') or {}).get('nm')
           or (x.get('mk') or {}).get('nm') or x.get('lm') or '')
    # 전용면적은 건축물대장(br.ar)만 쓴다 — 동·호까지 특정한 값이다.
    # mk.ar 로 대신하지 않는다. 그쪽은 단지 대표 평형이라(arGuess) 60㎡ 중앙값
    # 밑에 84㎡ 물건이 들어앉는다. 모르면 숫자를 만들지 말고 null 로 보낸다 —
    # 0 을 보내면 대시보드에서 '0㎡' 로 읽혀 없는 면적이 있는 것처럼 된다.
    ar = (x.get('br') or {}).get('ar')
    return {
        'date': today, 'buildingName': str(bld).strip(),
        'exclusiveArea': round(float(ar), 2) if ar else None,
        'caseNumber': x['caNo'] + (f' 물건{x.get("ino") or 1}' if x.get('multi') else ''),
        'court': x.get('ct') or '',
        'region': ' '.join(v for v in (x.get('r'), x.get('a1')) if v),
        'propertyType': prop_type(x.get('ut')),
        'address': x.get('a') or '',
        'appraisalValue': x.get('ap') or 0, 'minSalePrice': x.get('mn') or 0,
        'saleDate': x.get('d') or '', 'failCount': x.get('f') or 0,
        'status': status, 'winningBid': x.get('winBid') or 0 if st == '매각' else 0,
        'memo': ' · '.join(memo), 'analysisWritten': False,
        'source': '전국 경매 물건 현황판', 'sourceKey': last_key(x),
        'updatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


DASH_DONE = {'매각', '매각종료', '낙찰', '패찰', '종료', '취하', '기각'}


def last_key(x):
    return f'ct-{x["caNo"]}-{x.get("ino") or 1}'


def describe(old, x):
    """무엇이 바뀌었는지 한 줄. 알림·메모에 그대로 쓴다."""
    st, d, mn, f = x.get('st'), x.get('d'), x.get('mn'), x.get('f')
    if st == '매각':
        return '매각(낙찰)'
    if st == '종료':
        return '종료 — ' + (x.get('final') or '취하·기각 등')
    bits = []
    if (f or 0) > (old.get('f') or 0):
        bits.append(f'유찰 {old.get("f") or 0}→{f}회')
    if d != old.get('d'):
        bits.append(f'기일 {old.get("d") or "미정"}→{d or "미정"}')
    if mn != old.get('mn'):
        bits.append(f'최저가 {won(old.get("mn"))}→{won(mn)}')
    return ', '.join(bits) if bits else '변경'


def register(S, D, idx, today, path):
    """사용자가 현황판에서 '권리분석보내기' 를 체크해 대시보드에 넣은 물건을
    추적 목록에 올린다. path 는 Drive 폴더의 ahj_market_chunk_*.json 내용을
    모아 둔 JSON(레코드 배열, 또는 그 배열들의 배열). 세션이 Drive 에서 받아
    data/dash-in/ 에 저장한 뒤 이걸 부른다. 고르는 건 사용자다 — 여기서는
    이미 대시보드에 있는 것만 등록하고, 새 물건을 만들어 보내지 않는다."""
    raw = json.loads(pathlib.Path(path).read_text(encoding='utf-8'))
    recs = []
    for r in raw:
        recs.extend(r if isinstance(r, list) else [r])
    have = {i['key'] for i in S['items']}
    added, unknown = [], []
    for r in recs:
        key = r.get('sourceKey') or ''
        m = re.match(r'^ct-(.+)-(\d+)$', key)
        if not m:
            # 페이지가 아닌 곳에서 넣은 레코드 — 사건번호로 되찾는다
            # 대시보드 표기는 '2025타경8594(1)' · '2025타경9474 물건1' 처럼 제각각이다
            m = re.match(r'^(\d{4}타경\d+)', (r.get('caseNumber') or '').strip())
            if not m:
                continue
            cano = m.group(1)
            im = re.search(r'\((\d+)\)|물건(\d+)', r.get('caseNumber') or '')
            ino = int(im.group(1) or im.group(2)) if im else 1
            key = f'ct-{cano}-{ino}'
        else:
            cano, ino = m.group(1), int(m.group(2))
        if key in have:
            # 이미 추적 중 — 대시보드 쪽(다른 세션·사용자)이 status 를 바꿨으면
            # 그 값을 last.status 로 받아 둔다. 안 그러면 다음 갱신 때 우리가
            # 옛 status 로 덮어쓴다(2026-09-09 대시보드가 '매각종료' 로 바꾼 것을
            # 우리는 '조사중' 으로 알고 있었다).
            st_now = (r.get('status') or '').strip()
            for it in S['items']:
                if it['key'] == key and st_now and it.get('last', {}).get('status') != st_now:
                    it['last']['status'] = st_now
                    print('  ~', key, 'status →', st_now)
            continue
        # 대시보드의 법원 표기는 믿지 않는다('대구지방법원' 이라 적혔는데 실제는
        # 대구서부지원인 경우가 있다). 사건번호+물건번호로 찾고, 여럿이면 대구권을 고른다.
        cands = [x for x in D if x.get('caNo') == cano and (x.get('ino') or 1) == ino]
        if len(cands) > 1:
            cands.sort(key=lambda x: (x.get('ct') != r.get('court'), x.get('r') != '대구'))
        x = cands[0] if cands else None
        if not x:
            if cano not in unknown:
                unknown.append(cano)
            continue
        S['items'].append({
            'key': key, 'ct': x.get('ct'), 'caNo': cano, 'ino': ino, 'sentAt': today,
            'via': '현황판 체크',
            'last': {'st': x.get('st'), 'd': x.get('d'), 'mn': x.get('mn'), 'f': x.get('f'),
                     'status': r.get('status') or '조사중'}})
        have.add(key)
        added.append(key)
    print(f'등록 {len(added)}건' + (f' · 보드에 없어 못 넣음 {len(unknown)}건 {unknown[:5]}' if unknown else ''))
    for k in added:
        print('  +', k)
    return added


def auto_landmarks(S, D, today, out, write):
    """대장 단지(lm) 중 권리 자국이 없는 진행중 물건을 대시보드에 자동 등록한다.
    2026-09-11 사용자 지시: '주요단지들 권리문제없는것들은 자동으로 데일리경매분석
    탭에 등록'. 그 밖의 물건은 여전히 사용자가 고른다.

    조건 — 넷 다 맞아야 한다:
      lm            data/landmarks.json 명부에 있는 단지
      st 진행중     끝난 사건은 보내지 않는다
      verified      법원 원본을 대조한 것만. 색인만 보고 '깨끗하다' 고 하지 않는다
      screen clean  screen_clean.py 가 '자국 없음' 으로 매긴 것(특이사항·대항력·
                    유찰 2회 이상이 없고, 유찰 횟수를 안다). 기일이 아직 없는
                    신건은 판정 불가라 자동으로는 안 들어간다 — 기일이 잡히고
                    매각물건명세서가 나온 뒤에야 들어간다.
      전용 ≤95㎡    2026-09-22 사용자 지시: '대장단지 자동 등록 선별은 전용
                    95㎡ 이하(84형·34~36평형)만. 대형평형은 투자자 인기가 없어
                    대시보드에서 제외하고 있다'. 근거는 건축물대장(br.ar) 뿐이다
                    — 면적을 모르는 물건은 **넣지 않는다**. 큰지 작은지 모르는
                    것을 '95㎡ 이하' 목록에 넣으면 그 목록이 거짓말이 된다.
      기일 2주 내    (폐지) 2026-09-22 '매각기일이 오늘부터 2주 안인 물건만' 이었으나
                    2026-10-07 사용자 지시 '14일 이상이 되어도 상관없어, 어차피 남은
                    기간별로 저장하고 있어서' 로 상한을 없앴다. 앞으로의 기일이면 된다.
    이 넷 중 면적·기일 창은 **자동 등록에만** 적용한다. 사용자가 현황판에서 직접
    고른 물건은 그대로 간다 — 무엇을 볼지는 사용자가 정한다(2026-09-08 원칙).
    2026-09-28 사용자 지시: '대구는 권리문제 없고 기일이 10일 이상 남은 걸로 다 올리면
    되고, 그 외 지방이나 수도권은 대장단지만'. 그래서 대구(r=='대구')는 대장 단지가
    아니어도 들어가고, 조건은 진행중·verified·screen clean·아파트·기일이 오늘+10일
    이후 — 2주 창과 면적 문턱은 대구에 적용하지 않는다(2026-09-29 '대형도 일단
    넣자', 면적 모르는 것도 넣는다). 대구 밖은
    위 대장 단지 규칙 그대로다.
    이미 추적 목록에 있는 키는 건너뛴다(사용자가 보냈든 예전에 자동으로 보냈든).
    출력 파일 이름은 ahj_market_chunk_<날짜>_lm<N>_<stamp>.json 으로, 갱신 파일
    (_auto)과 구분된다."""
    have = {i['key'] for i in S['items']}
    # 사용자가 대시보드에서 지운 사건은 다시 보내지 않는다. 추적 목록에서
    # 빼기만 하면 have 에서 사라져 바로 다음 실행에 후보로 되돌아온다 —
    # 지운 행동이 매일 무효가 되는 셈이다. 2026-09-22 에 사용자가 국민평형
    # 기준으로 4건을 지웠고(ahj_patch_chunk_..._market_kukmin.json), 그중
    # 둘은 면적을 몰라서 지금은 면적 문턱에 걸리지만 건축물대장이 붙는 날
    # 되살아난다. 지운 것은 지운 것이다.
    removed = {c for r in S.get('removed', []) for c in (r.get('caNos') or ())}
    horizon = ((datetime.date.fromisoformat(today)
                + datetime.timedelta(days=AUTO_WINDOW_DAYS)).isoformat()
               if AUTO_WINDOW_DAYS else None)
    dg_from = (datetime.date.fromisoformat(today)
               + datetime.timedelta(days=AUTO_DAEGU_MIN_DAYS)).isoformat()
    picks = []
    skipped = {'면적 미확인': 0, f'전용 {AUTO_MAX_AREA:g}㎡ 초과': 0,
               f'기일이 {AUTO_WINDOW_DAYS}일 뒤': 0,
               f'대구 기일 {AUTO_DAEGU_MIN_DAYS}일 안': 0}
    for x in D:
        # 대구권 = 대구 + 경산·칠곡(대구지방법원 관할). 경산·칠곡은 보드에서 r='경북' 이라 따로 본다.
        # 2026-10-08: GPT 프롬프트에 '대구·경산·칠곡은 같은 기준' 으로 안내했는데 코드가 대구만 보고 있었다.
        daegu = x.get('r') == '대구' or (x.get('r') == '경북' and x.get('a1') in ('경산시', '칠곡군'))
        if not (x.get('lm') or daegu) or x.get('st') != '진행중' or not x.get('verified'):
            continue
        if x.get('screen') != 'clean' or x.get('ut') != '아파트':
            continue
        # 앞으로 입찰할 수 있는 기일이 잡힌 것만. 기일이 지났으면 결과(유찰·매각)를
        # 아직 모르는 것이고, 기일이 없으면 명세서도 없다 — 다음 기일이 잡히면 들어간다.
        if not x.get('d') or x['d'] < today:
            continue
        k = last_key(x)
        if k in have or x.get('caNo') in removed:
            continue
        if daegu:
            if x['d'] < dg_from:
                skipped[f'대구 기일 {AUTO_DAEGU_MIN_DAYS}일 안'] += 1
                continue
            # 면적은 보지 않는다. 2026-09-29 에 국평(95㎡ 이하) 기준을 잠깐 걸었다가
            # 같은 날 사용자가 '대형도 일단 넣자' 로 되돌렸다 — 면적을 모르는 것도 넣는다.
            picks.append(x)
            continue
        ar = (x.get('br') or {}).get('ar')
        if not ar:
            skipped['면적 미확인'] += 1
            continue
        if float(ar) > AUTO_MAX_AREA:
            skipped[f'전용 {AUTO_MAX_AREA:g}㎡ 초과'] += 1
            continue
        if horizon and x['d'] > horizon:
            skipped[f'기일이 {AUTO_WINDOW_DAYS}일 뒤'] += 1
            continue
        picks.append(x)
    picks.sort(key=lambda x: (x.get('r') != '대구', x.get('d') or '9999'))
    why = ' · '.join(f'{k} {v}' for k, v in skipped.items() if v)
    print(f'대장 단지 자동 등록 후보 {len(picks)}건'
          + (f' (제외 — {why})' if why else ''))
    if skipped['면적 미확인']:
        # 이걸 조용히 넘기면 '대장 단지에 쓸 물건이 없다' 로 잘못 읽힌다.
        # 건축물대장이 안 붙은 것이지 물건이 없는 것이 아니다.
        print(f"  ※ {skipped['면적 미확인']}건은 크기 때문이 아니라 건축물대장"
              ' 전용면적이 없어 빠졌습니다 — fetch_bldrgst.py 가 채웁니다')
    recs = []
    for x in picks:
        why = x.get('screenBy') or ''
        if x.get('lm'):
            rec = dash_item(x, {'status': '조사중'}, today, f'⭐ 대장 단지 자동 등록 — {x["lm"]} · 권리 자국 없음({why})')
            rec['buildingName'] = '⭐ ' + rec['buildingName']
        else:
            rec = dash_item(x, {'status': '조사중'}, today, f'대구 자동 등록 — 권리 자국 없음({why}) · 기일 {AUTO_DAEGU_MIN_DAYS}일 이상 남음')
        rec['memo'] = rec['memo'].replace('현황판 자동 갱신', '현황판 자동 등록', 1)
        recs.append(rec)
        print(f'  + {x["caNo"]} {x.get("a1")} {x.get("lm") or "(대구)"} · {x.get("d") or "기일 미정"} · 최저 {won(x.get("mn"))} · {why}')
        if write:
            S['items'].append({
                'key': last_key(x), 'ct': x.get('ct'), 'caNo': x['caNo'],
                'ino': x.get('ino') or 1, 'sentAt': today,
                'via': '대장단지 자동' if x.get('lm') else '대구 자동',
                'last': {'st': x.get('st'), 'd': x.get('d'), 'mn': x.get('mn'),
                         'f': x.get('f'), 'status': '조사중'}})
    if not recs:
        return []
    if write:
        out.mkdir(parents=True, exist_ok=True)
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S')
        fn = out / f'dash-auto-{today}.json'
        fn.write_text(json.dumps(recs, ensure_ascii=False), encoding='utf-8')
        (out / f'dash-auto-{today}.title').write_text(
            f'{S.get("prefix", "ahj_market_chunk_")}{today}_lm{len(recs)}_{stamp}.json',
            encoding='utf-8')
        SENT.write_text(json.dumps(S, ensure_ascii=False, indent=1), encoding='utf-8')
        print(f'저장 {fn} — Google Drive 폴더 {S.get("folderId")} 에 '
              f'{(out / f"dash-auto-{today}.title").read_text()} 이름으로 올려라')
        # 현황판의 권리분석보내기 체크 저장분에도 넣어 카드가 '전송됨' 으로 보이게 한다.
        bd = ROOT / 'data' / 'bdone.json'
        try:
            keys = json.loads(bd.read_text(encoding='utf-8'))
        except Exception:
            keys = []
        for x in picks:
            if last_key(x) not in keys:
                keys.append(last_key(x))
        bd.write_text(json.dumps(sorted(keys), ensure_ascii=False, indent=0), encoding='utf-8')
        print(f'data/bdone.json 갱신 ({len(keys)}건)')
    else:
        print('(미리보기 — --write 로 등록 파일을 만든다)')
    return recs


def main():
    global AUTO_DAEGU_MIN_DAYS
    a = argparse.ArgumentParser()
    a.add_argument('--write', action='store_true')
    a.add_argument('--out', default=str(ROOT / 'data' / 'dash-out'))
    a.add_argument('--register', metavar='JSON',
                   help='Drive 폴더에서 받은 chunk 레코드(JSON 배열)를 추적 목록에 등록')
    a.add_argument('--auto', action='store_true',
                   help='대장 단지(lm) 중 권리 자국 없는 진행중 물건을 대시보드에 자동 등록 (--write 와 같이)')
    a.add_argument('--daegu-min-days', type=int, metavar='N',
                   help=f'이번 한 번만 대구 기일 문턱을 N일로 (기본 {AUTO_DAEGU_MIN_DAYS}) — 사용자가 따로 요청했을 때')
    a = a.parse_args()
    if a.daegu_min_days is not None:
        AUTO_DAEGU_MIN_DAYS = a.daegu_min_days

    S = json.loads(SENT.read_text(encoding='utf-8'))
    D = json.loads((ROOT / 'data' / 'data.json').read_text(encoding='utf-8'))
    idx = {(x.get('ct'), x.get('caNo'), x.get('ino') or 1): x for x in D}
    today = kst_today().isoformat()

    if a.register:
        register(S, D, idx, today, a.register)
        S['lastScan'] = today
        SENT.write_text(json.dumps(S, ensure_ascii=False, indent=1), encoding='utf-8')
        print('저장 data/dash-sent.json')
        return
    if a.auto:
        auto_landmarks(S, D, today, pathlib.Path(a.out), a.write)
        return

    updates, lines = [], []
    for it in S['items']:
        x = idx.get((it['ct'], it['caNo'], it.get('ino') or 1))
        if not x:
            lines.append(f'  {it["caNo"]}  보드에 없음 — 건너뜀')
            continue
        old = it.get('last') or {}
        now = {'st': x.get('st'), 'd': x.get('d'), 'mn': x.get('mn'), 'f': x.get('f')}
        if all(now[k] == old.get(k) for k in now):
            continue
        # 대시보드가 이미 끝난 물건으로 알고 있으면(아침 루틴이 법원 결과로 '매각종료'·낙찰가를
        # 넣었거나 사용자가 낙찰/패찰로 바꿈) 매각·종료를 다시 보내지 않는다. 보내면 법원 확정
        # 낙찰가가 0 이나 색인 어림값으로 덮이고 상태가 되돌아간다(2026-09-25 2025타경9620).
        if x.get('st') in ('매각', '종료') and old.get('status') in DASH_DONE:
            lines.append(f'  {it["caNo"]}  대시보드가 이미 {old["status"]} — 보내지 않음')
            if a.write:
                it['last'] = {**now, 'status': old['status']}
                it['updatedAt'] = today
            continue
        # 대시보드가 법원에서 읽어 준 결과(dash_court.py → apply_court)를 그대로 되돌려 보내지
        # 않는다. 대시보드는 이미 그 값을 갖고 있고, '변경' 을 받아 기일을 비운 값을 보내면
        # 대시보드의 매각기일이 지워진다. 추적 기준값만 지금 값으로 맞춘다.
        if x.get('stBy') == '법원경매정보(대시보드 조회)' and x.get('stAt', '') >= (it.get('updatedAt') or ''):
            lines.append(f'  {it["caNo"]}  대시보드 법원 결과로 맞춤 — 되돌려 보내지 않음')
            if a.write:
                it['last'] = {**now, 'status': old.get('status')}
                it['updatedAt'] = today
            continue
        change = describe(old, x)
        lines.append(f'  {it["caNo"]}  {change}')
        updates.append(dash_item(x, old, today, change))
        if a.write:
            it['last'] = {**now, 'status': updates[-1]['status']}
            it['updatedAt'] = today

    print(f'보낸 물건 {len(S["items"])}건 중 변동 {len(updates)}건')
    for l in lines:
        print(l)
    if not updates:
        return
    if a.write:
        out = pathlib.Path(a.out)
        out.mkdir(parents=True, exist_ok=True)
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S')
        fn = out / f'dash-update-{today}.json'
        fn.write_text(json.dumps(updates, ensure_ascii=False), encoding='utf-8')
        (out / f'dash-update-{today}.title').write_text(
            f'{S.get("prefix", "ahj_market_chunk_")}{today}_auto{len(updates)}_{stamp}.json',
            encoding='utf-8')
        SENT.write_text(json.dumps(S, ensure_ascii=False, indent=1), encoding='utf-8')
        print(f'저장 {fn} — Google Drive 폴더 {S.get("folderId")} 에 '
              f'{(out / f"dash-update-{today}.title").read_text()} 이름으로 올려라')
    else:
        print('(미리보기 — --write 로 갱신 파일을 만든다)')


if __name__ == '__main__':
    main()
