#!/usr/bin/env python3
"""법원경매정보(courtauction.go.kr)에서 사용자 PC 크롬으로 직접 읽은 기일내역을 보드에 반영한다.

  scripts/apply_court.py                 # 반영하지 않고 무엇이 바뀌는지만 보여준다
  scripts/apply_court.py --write         # 아직 반영 안 한 data/court-in/*.json 을 반영
  scripts/apply_court.py --write --force data/court-in/2026-09-28.json   # 다시 반영

조회는 클라우드에서 하지 않는다(법원이 서버 IP를 막는다). 사용자 PC 세션이
Claude in Chrome 으로 한 건씩 천천히 읽어서 data/court-in/YYYY-MM-DD.json 에
남기고, 이 스크립트가 그 파일만 읽는다. 파일 형식:

  {"checkedAt": "2026-09-28",
   "items": [
     {"ct": "대구서부지원", "caNo": "2026타경3394", "ino": 1,
      "final": "취하",          # 종국결과 문구 그대로. 진행 중이면 null
      "finalAt": "2026-09-17",  # 종국일. 모르면 null
      "full": true,             # 기일내역을 처음부터 끝까지 다 읽었으면 true
      "hold": false,            # true 면 반영하지 않는다(물건 수 불일치 등 확인 중)
      "stay": null,             # 집행정지면 "집행정지". 풀렸으면 false. 모르면 넣지 않는다
      "spAdd": ["대항력"],       # 법원 문서(매각물건명세서 비고 등)에서 새로 읽은 특이사항. 이름은 쓰지 않는다
      "ld": [{"d": "2026-08-11", "amt": 213000000, "res": "유찰"},
             {"d": "2026-09-08", "amt": 149100000, "res": "변경"},
             {"d": "2026-10-13", "amt": 104370000, "res": null},
             {"d": "2026-09-10", "amt": 187727000, "res": "매각", "winBid": 231800000}]}]}

실명(소유자·채무자·임차인)은 파일에 넣지 않는다. 이 스크립트도 위 필드만 읽는다.

현황판에 없는 사건은 기본적으로 추가하지 않는다. 다만 PC 세션이 법원경매정보 물건검색으로
새로 찾은 아파트는 항목에 "new" 블록을 달아 보낸다(2026-10-07 사용자 지시 "경매정보검색을 해서
전국 대장단지, 대구권 집중해서 경매물건 찾아줘서 대시보드로 자동추출"). 그런 항목만 추가한다:

     {"ct": "대구지방법원", "caNo": "2025타경10005", "ino": 1, "full": true,
      "ld": [...기일내역...],
      "new": {"addr": "대구광역시 수성구 두산동 1003 호반써밋수성 101동 31층3104호",
              "bld": "호반써밋수성",       # 단지명(물건상세의 건물명). 모르면 null
              "ut": "아파트",              # 물건상세의 용도 그대로. 아파트만 추가한다
              "ap": 1020000000,            # 감정가(원)
              "ar": 109.73,                # 전용면적(㎡). 모르면 null
              "note": "…"}}                # 물건상세 '물건비고' 원문. 비어 있으면 "". 실명은 OO 로 가려서

note 를 읽지 않았으면(null) 추가하지 않는다 — 비고를 안 본 물건을 '법원 확인' 으로 올리면
권리 자국 등급이 거짓말이 된다.
"""
import argparse, datetime, glob, json, os, sys
sys.path.insert(0, 'scripts')
import re
from codef_to_board import _FINAL_CLOSED
from auction_taxonomy import SPECIAL_RIGHTS as SP_OK, special_rights
from parse_auction import split_addr
from harvest_nice import REGION

_KST = datetime.timezone(datetime.timedelta(hours=9))
IN_DIR = 'data/court-in'
APPLIED = os.path.join(IN_DIR, 'applied.json')
SRC = '법원경매정보'


def won(n):
    return f'{n:,}원'


def norm_ld(ld):
    out = []
    for e in ld or []:
        if not e.get('d'):
            continue
        res = (e.get('res') or '').strip() or None
        amt = int(e['amt']) if e.get('amt') not in (None, '') else None
        if res and res.startswith('매각') and e.get('winBid') and '(' not in res:
            res = f'매각({won(int(e["winBid"]))})'
        out.append({'d': e['d'], 'amt': amt, 'res': res})
    out.sort(key=lambda e: e['d'])
    return out


def drop_decision_dates(ld):
    """결과도 최저가도 없는 기일이 바로 앞 기일의 7일 안에 붙어 있으면 매각결정기일이다
    (매각기일 1주 뒤). 매각기일로 읽으면 다음 기일이 1주 뒤로 잘못 잡힌다 — 뺀다.
    2026-10-08 GPT 결과 21건 전부가 이 꼴로 왔다."""
    out = []
    for e in ld:
        if e.get('res') is None and e.get('amt') is None and out:
            p = out[-1]
            gap = (datetime.date.fromisoformat(e['d']) - datetime.date.fromisoformat(p['d'])).days
            if 0 < gap <= 7:
                continue
        out.append(e)
    return out


def merge_ld(old, new, full):
    if full:
        return new
    by = {e['d']: e for e in old or []}
    for e in new:
        # 결과만 알고 그 기일의 최저가를 모르는 기록(대시보드 결과의 '9/28 매각(…)')이
        # 이미 아는 최저가를 지우지 않게 한다.
        if e.get('amt') is None and (by.get(e['d']) or {}).get('amt') is not None:
            e = {**e, 'amt': by[e['d']]['amt']}
        by[e['d']] = e
    return sorted(by.values(), key=lambda e: e['d'])


def step_down(a, b):
    """b 가 a 에서 저감 한 계단(20%·30%, 1000원 아래 버림)인가."""
    return bool(a and b) and any(abs(a * r - b) <= 1000 for r in (0.7, 0.8))


def settle_stale(ld, court_ld):
    """법원이 더 늦은 기일을 알려 주면, 그보다 앞선 '결과 없음' 기일은 이미 지나간 것이다.
    다음 기일 최저가가 정확히 한 계단 내려갔으면 유찰, 같으면 변경, 그 밖에는 '결과 미상'.
    모르는 결과를 지어내지 않는다 — 계단이 안 맞으면 미상으로 둔다."""
    if not court_ld:
        return ld
    last = max(e['d'] for e in court_ld)
    court_ds = {e['d'] for e in court_ld}
    out = []
    for i, e in enumerate(ld):
        if not e.get('res') and e['d'] < last and e['d'] not in court_ds:
            nxt = next((n for n in ld[i + 1:] if n.get('amt')), None)
            a, b = e.get('amt'), (nxt or {}).get('amt')
            res = '유찰' if step_down(a, b) else ('변경' if a and b and a == b else '결과 미상')
            e = {**e, 'res': res}
        out.append(e)
    return out


def win_bid(res):
    digits = ''.join(ch for ch in (res or '') if ch.isdigit())
    return int(digits) if digits else None


# 탱크옥션(사용자 계정) 권리 요약 — 이름 없이 이 칸만 받는다.
TANK_KEYS = {'base', 'baseDate', 'takeover', 'takeoverAmt', 'due', 'resale', 'ten', 'url', 'checkedAt'}
TEN_KEYS = {'moveIn', 'fixed', 'dividend', 'deposit', 'dh'}


def clean_tank(t, checked):
    """GPT·PC 가 탱크옥션에서 읽어 온 권리 요약을 이름 없는 꼴로 추린다."""
    if not isinstance(t, dict):
        return None
    out = {k: v for k, v in t.items() if k in TANK_KEYS and k != 'ten'}
    ten = [{k: v for k, v in e.items() if k in TEN_KEYS}
           for e in (t.get('ten') or []) if isinstance(e, dict)]
    if ten:
        out['ten'] = ten
    if not out:
        return None
    out.setdefault('checkedAt', checked)
    out['src'] = '탱크옥션(사용자 계정 · 법원 원본 아님)'
    return out


def court_name(ct):
    """사이트 표기('대구지방법원 서부지원', '수원지방법원 성남지원')를 현황판 표기로."""
    ct = re.sub(r'\s+', ' ', (ct or '').strip())
    m = re.match(r'^(\S+?)지방법원\s+(\S+?)지원$', ct)
    if m:
        city, br = m.groups()
        return f'{city}{br}지원' if br in ('서부', '동부', '남부', '북부') else f'{br}지원'
    return ct


def _core(ct):
    return re.sub(r'지방법원|법원|지원|\s', '', ct or '')


def find_item(idx, c):
    """(법원, 사건번호, 물건번호) 로 찾고, 법원 표기가 달라 못 찾으면 사건번호가 같고
    법원 이름 핵심어가 겹치는 한 건을 찾는다(GPT·사람이 사이트 표기 그대로 적은 경우)."""
    ino = c.get('ino') or 1
    x = idx.get((c.get('ct'), c.get('caNo'), ino)) or idx.get((court_name(c.get('ct')), c.get('caNo'), ino))
    if x:
        return x
    core = _core(court_name(c.get('ct')))
    hits = [v for (ct, ca, i), v in idx.items()
            if ca == c.get('caNo') and i == ino and core and (_core(ct) in core or core in _core(ct))]
    return hits[0] if len(hits) == 1 else None


def new_item(c, checked):
    """PC 물건검색으로 찾은 새 사건을 보드 항목으로 만든다. 못 만들면 (None, 이유)."""
    n = c.get('new') or {}
    if (n.get('ut') or '').strip() != '아파트':
        return None, f'용도 {n.get("ut") or "미상"} — 아파트만 추가'
    if n.get('note') is None:
        return None, '물건비고를 읽지 않음 — 추가하지 않음'
    try:
        ap = int(n.get('ap') or 0)
    except (TypeError, ValueError):
        ap = 0
    if not ap:
        return None, '감정가 없음'
    full = (n.get('addr') or '').strip()
    r = a = None
    for rname, cf in REGION.items():
        m = re.match(r'\s*' + cf['sido'] + r'\s*', full)
        if m:
            r, a = rname, full[m.end():].strip()
            break
    if not r or not a:
        return None, f'권역을 모르는 주소: {full[:30]}'
    a1, a2 = split_addr(full)
    ino = c.get('ino') or 1
    note = n['note'].strip()
    x = {'r': r, 'c': c['caNo'] if ino == 1 else f'{c["caNo"]} [{ino}]', 'ct': court_name(c['ct']),
         'caNo': c['caNo'], 'ino': ino, 'multi': [ino], 'a': a, 'a1': a1, 'a2': a2,
         'ap': ap, 'ut': '아파트', 'utc': '주거용건물', 'utGuess': False,
         'sp': special_rights(note), 'prodNote': note, 'st': '진행중',
         'src': 'court-search', 'foundAt': checked}
    if n.get('ar') or n.get('bld'):
        x['br'] = {'src': '법원경매정보 물건상세'}
        if n.get('ar'):
            x['br']['ar'] = float(n['ar'])
        if n.get('bld'):
            x['br']['bld'] = str(n['bld']).strip()
    return x, None


def fill_missing(x, c):
    """이미 현황판에 있는 사건인데 비어 있는 칸(색인 발굴분의 감정가·호수·면적·비고)을 new 블록으로 채운다.
    있는 값은 바꾸지 않는다. 2026-10-08: 색인에서 온 9640·9712·9750 이 감정가 0 으로 대시보드에 갈 뻔했다."""
    n = c.get('new') or {}
    if not x.get('ap') and n.get('ap'):
        x['ap'] = int(n['ap'])
    full = (n.get('addr') or '').strip()
    for cf in REGION.values():
        m = re.match(r'\s*' + cf['sido'] + r'\s*', full)
        if m:
            a = full[m.end():].strip()
            # 호수까지 있는 주소가 더 구체적이면 바꾼다(동만 있던 색인 주소).
            if a and '호' in a and '호' not in (x.get('a') or ''):
                x['a'] = a
            break
    br = dict(x.get('br') or {})
    if n.get('ar') and not br.get('ar'):
        br['ar'] = float(n['ar']); br.setdefault('src', '법원경매정보 물건상세')
    if n.get('bld') and not br.get('bld'):
        br['bld'] = str(n['bld']).strip()
    if br:
        x['br'] = br
    if n.get('note') is not None and not x.get('prodNote'):
        x['prodNote'] = n['note'].strip()
        for t in special_rights(x['prodNote']):
            x.setdefault('sp', [])
            if t not in x['sp']:
                x['sp'].append(t)
    if x.get('ut') == '아파트':
        x['utGuess'] = False


def change_for(x, c, checked, by=SRC):
    """반영할 필드 dict 를 돌려준다. 반영하지 않으면 (None, 이유)."""
    if c.get('hold'):
        return None, '보류 표시(hold)'
    seen = x.get('stAt') or x.get('verifiedAt') or ''
    # 현황판 값이 더 새것이면 건너뛴다. 다만 그 새 값이 검색 색인(idx)에서 왔고 법원 결과가
    # 매각·종료면 법원 쪽을 쓴다 — 법원이 더 정확하고(낙찰가 원 단위) 끝난 결과는 되돌아가지
    # 않으므로 오래된 조회라도 안전하다(2026-10-01 2025타경8801: 색인 매각·낙찰가 없음).
    stale = seen > checked
    court_ld = drop_decision_dates(norm_ld(c.get('ld')))
    full = bool(c.get('full'))
    # '처음부터 다 읽었다(full)' 고 해도, 현황판이 이미 아는 결과 기일이 그 목록보다 앞에
    # 빠져 있으면 다 읽은 게 아니다 — 지우지 말고 합친다(2026-10-08 GPT 결과 2024타경125748:
    # 2025-07-15·2026-03-16 변경 행을 빼고 full:true 로 왔다).
    if full and court_ld:
        first = court_ld[0]['d']
        known = {e['d'] for e in court_ld}
        if any(e.get('res') and e['d'] < first and e['d'] not in known for e in x.get('ld') or []):
            full = False
    final = (c.get('final') or '').strip()
    if not court_ld and not final:
        return None, '기일내역도 종국결과도 없음'
    ld = merge_ld(x.get('ld'), court_ld, full)
    ld = settle_stale(ld, court_ld)
    # 법원이 매각을 알려 주면 그 뒤의 '결과 없음' 기일(예전 데이터의 저감 예정 r:'예정' 포함)은
    # 열리지 않는다 — 남겨 두면 매각된 물건이 다음 예정 기일 때문에 진행중으로 읽힌다
    # (2026-10-02 2025타경9076: 9/30 매각인데 10/30·11/27 예정 행이 남아 있었다).
    sold = [e['d'] for e in court_ld if (e.get('res') or '').startswith('매각')]
    if sold:
        ld = [e for e in ld if e.get('res') or e['d'] <= max(sold)]
    pending = [e for e in ld if not e.get('res')]
    done = [e for e in ld if e.get('res')]

    ch = {'ld': ld, 'final': final or x.get('final') or '',
          'verified': True, 'verifiedAt': checked, 'vsrc': '법원 확인',
          'stSrc': 'court', 'stAt': checked, 'stBy': by}
    if final and '집행정지' not in final and any(k in final for k in _FINAL_CLOSED):
        ch['st'] = '종료'
        if c.get('finalAt'):
            ch['closedAt'] = c['finalAt']
    elif not pending and done and done[-1]['res'].startswith('매각'):
        ch['st'] = '매각'
        # 최저가는 매각된 기일의 최저가다(그 전 행에서 복사된 값이 남아 있을 수 있다).
        if done[-1]['amt']:
            ch['mn'] = done[-1]['amt']
            if x.get('ap'):
                ch['rt'] = round(ch['mn'] / x['ap'] * 100)
        wb = win_bid(done[-1]['res'])
        if wb:
            ch['winBid'] = wb
            ch['winBidApprox'] = False
    else:
        ch['st'] = '진행중'
    if stale and not (x.get('stSrc') == 'idx' and ch['st'] in ('매각', '종료')):
        return None, f'현황판 값({seen})이 조회일({checked})보다 새것'
    # 집행정지(회생 등)는 종국이 아니다 — 종료로 돌리지 않고 특이사항(sp)에 단다.
    # sp 에 있으면 화면 칩·선별 등급('risk')·대구권 알림에 저절로 드러난다.
    sp = list(x.get('sp') or [])
    if 'stay' in c:
        sp = [t for t in sp if t != '집행정지']
        if c['stay']:
            sp.append('집행정지')
    # 새 특이사항은 더하기만 한다. 없다고 적힌 것을 지우지 않는다.
    for t in c.get('spAdd') or []:
        if t in SP_OK and t not in sp:
            sp.append(t)
    if sp != (x.get('sp') or []):
        ch['sp'] = sp
    # 다음 기일은 결과가 아직 없는 기일이다. 진행 중인데 없으면 비운다 — 화면이
    # '유찰 — 다음 매각기일 미게시' 로 읽는다. 매각이면 매각기일을 남기고,
    # 종료면 기존 값을 건드리지 않는다.
    if pending:
        ch['d'] = pending[0]['d']
    elif ch['st'] == '매각':
        ch['d'] = done[-1]['d']
    elif ch['st'] == '진행중':
        ch['d'] = None
    if pending and pending[0]['amt']:
        ch['mn'] = pending[0]['amt']
        if x.get('ap'):
            ch['rt'] = round(ch['mn'] / x['ap'] * 100)
    # 유찰 횟수: 처음부터 다 읽었을 때만 센 값을 쓴다. 일부만 읽었으면 센 값은
    # 하한일 뿐이라 기존 값보다 클 때만 올린다.
    n = sum(1 for e in ld if '유찰' in (e.get('res') or ''))
    ch['f'] = n if full else max(x.get('f') or 0, n)
    return ch, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='*')
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--force', action='store_true', help='이미 반영한 파일도 다시 반영')
    a = ap.parse_args()

    applied = json.load(open(APPLIED, encoding='utf-8')) if os.path.exists(APPLIED) else []
    files = a.files or sorted(f for f in glob.glob(os.path.join(IN_DIR, '*.json'))
                              if not f.endswith('applied.json'))
    if not a.force:
        files = [f for f in files if os.path.basename(f) not in applied]
    if not files:
        print('  법원 조회 결과: 새 파일 없음')
        return

    D = json.load(open('data/data.json', encoding='utf-8'))
    idx = {(x.get('ct'), x.get('caNo'), x.get('ino') or 1): x for x in D}
    # 사용자가 대시보드에서 지운 사건은 새로 넣지 않는다(dash-sent.json 의 removed).
    removed = set()
    if os.path.exists('data/dash-sent.json'):
        for r in json.load(open('data/dash-sent.json', encoding='utf-8')).get('removed') or []:
            removed.update(r.get('caNos') or [] if isinstance(r, dict) else [r])
    stats = {'반영': 0, '추가': 0, '매각': 0, '종료': 0, '진행중': 0, '건너뜀': 0, '없음': 0}
    for f in files:
        doc = json.load(open(f, encoding='utf-8'))
        checked = doc.get('checkedAt') or datetime.datetime.now(_KST).date().isoformat()
        print(f'── {os.path.basename(f)} (조회 {checked}, {len(doc.get("items") or [])}건) ──')
        for c in doc.get('items') or []:
            key = (court_name(c.get('ct')), c.get('caNo'), c.get('ino') or 1)
            x = find_item(idx, c)
            label = f'{key[1]} 물건{key[2]} {key[0]}'
            added = False
            if not x and c.get('new') and key[1] in removed:
                stats['없음'] += 1
                print(f'  {label}  사용자가 대시보드에서 지운 사건 — 추가하지 않음')
                continue
            if not x and c.get('new'):
                x, why = new_item(c, checked)
                if not x:
                    stats['없음'] += 1
                    print(f'  {label}  현황판에 없음 — 추가 안 함: {why}')
                    continue
                added = True
            if not x:
                stats['없음'] += 1
                print(f'  {label}  현황판에 없음 — 추가하지 않음')
                continue
            if not added and c.get('new'):
                fill_missing(x, c)
            ch, why = change_for(x, c, checked, doc.get('by') or SRC)
            if added and ch:
                stats['추가'] += 1
                print(f'  {label}  신규 추가 — {x["a"][:40]} · 감정가 {won(x["ap"])}'
                      + (f' · 특이사항 {",".join(x["sp"])}' if x['sp'] else ''))
                if a.write:
                    D.append(x)
                    idx[key] = x
            if not ch:
                stats['건너뜀'] += 1
                print(f'  {label}  건너뜀: {why}')
                continue
            before = f'{x.get("st")} {x.get("d") or "-"} {x.get("mn") or "-"} 유찰{x.get("f") or 0}'
            after = f'{ch["st"]} {ch.get("d", x.get("d")) or "-"} {ch.get("mn", x.get("mn")) or "-"} 유찰{ch["f"]}'
            mark = '' if before == after else '  ←'
            print(f'  {label}  {before}  →  {after}{mark}'
                  + (f'  낙찰 {won(ch["winBid"])}' if ch.get('winBid') else '')
                  + (f'  ({ch["final"]})' if ch['st'] == '종료' else ''))
            stats['반영'] += 1
            stats[ch['st']] += 1
            tk = clean_tank(c.get('tank'), checked)
            if tk:
                ch['tank'] = {**(x.get('tank') or {}), **tk}
            if a.write:
                if 'd' in ch and ch['d'] is None:
                    x.pop('d', None)
                for k, v in ch.items():
                    if k != 'd' or v is not None:
                        x[k] = v
        if a.write and os.path.basename(f) not in applied:
            applied.append(os.path.basename(f))

    print('  합계: ' + ' · '.join(f'{k} {v}' for k, v in stats.items()))
    if a.write:
        json.dump(D, open('data/data.json', 'w', encoding='utf-8'), ensure_ascii=False)
        os.makedirs(IN_DIR, exist_ok=True)
        with open(APPLIED, 'w', encoding='utf-8') as fp:
            json.dump(applied, fp, ensure_ascii=False, indent=1)
        print('  data/data.json 저장 · 반영 기록 data/court-in/applied.json')
    else:
        print('  (미리보기 — 반영하려면 --write)')


if __name__ == '__main__':
    main()
