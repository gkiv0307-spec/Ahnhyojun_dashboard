#!/usr/bin/env python3
"""data/rtms.json 의 실거래가를 경매·공매 물건에 붙인다.

  scripts/attach_rtms.py            # data.json 과 onbid.json 에 mk 를 얹는다
  scripts/attach_rtms.py --dry      # 붙이지 않고 적중률만 본다

매칭 순서
  1) (법정동, 지번)  — 1차. 주소에서 그대로 뽑히고 표기 흔들림이 없다.
  2) (단지명, 구)    — 2차. 건축물대장 건물명이 있을 때만.
지번이 같아도 단지가 여럿인 경우가 있어(주공 1·2단지 등) 2차는 1차가
비었을 때만 쓴다.

**시·도까지 대조한다.** 구 이름은 시·도를 넘어 겹치고(대구 남구 / 부산 남구),
법정동 이름과 지번도 도시가 다르면 얼마든지 같을 수 있다. 시·도를 안 보면
대구 단지의 시세가 부산 물건에 붙는다.

면적
  전용면적을 정수로 반올림해 버킷을 만들었다. 물건 면적과 ±3㎡ 안에서
  가장 가까운 버킷을 고른다. 84.98 과 84.9746 은 같은 평형인데 소수점까지
  맞추면 절대 안 붙는다.
"""
import argparse, json, pathlib, re, sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
AR_TOL = 3.0


# 법정동(동/리/가) 바로 뒤에 붙는 지번.
_DONG = re.compile(r'([가-힣]{1,6}(?:동|리|가))\s*(?:일원\s*)?(?:산\s*)?(\d+(?:-\d+)?)')
# 도로명주소는 끝에 '(지산동,지산타운)' 처럼 법정동과 단지명을 괄호로 붙여준다.
_PAREN = re.compile(r'\(([가-힣0-9]+(?:동|리|가))\s*,\s*([^)]+)\)')


# 실거래 색인은 이름이 겹치면 '장림현대(372-4)' 처럼 지번을 달아 구분한다.
_NM_PAREN = re.compile(r'\([^)]*\)$')


def nm_key(v):
    """단지명 대조용 표준형.

    실거래 색인은 '신대연코오롱하늘채', 경매 표기는 '신대연코오롱하늘채아파트'
    다. 꼬리의 '아파트' 는 이름이 아니라 종별이라 떼도 다른 단지가 되지 않는다.
    반대로 '2차' 같은 차수는 **절대 떼지 않는다** — 그건 다른 단지다.
    색인 쪽 '(372-4)' 도 뗀다. 그러면 같은 이름 단지가 둘이 되지만,
    _one 의 '후보가 하나일 때만' 규칙이 그때 걸러 준다.
    """
    v = re.sub(r'\s+', '', v or '')
    v = _NM_PAREN.sub('', v)
    return re.sub(r'아파트$', '', v) or v


def gu_key(v):
    """'창원시 의창구' 와 '의창구' 를 같은 것으로 본다. 경매 주소는 시+구를
    붙여 쓰고 실거래 색인은 구만 쓴다."""
    v = (v or '').strip()
    return v.split()[-1] if v else ''


def build_index(sites):
    global AMBIG
    AMBIG = ambiguous_gu(sites)
    """실거래가 API 의 umdNm 은 '다사읍 서재리' 처럼 읍·면까지 붙어서 온다.
    경매 주소에는 '서재리' 만 적히므로 마지막 토큰으로도 찾을 수 있어야 한다.
    또 도로명주소 물건을 위해 (구, 단지명) → 단지 색인도 같이 만든다."""
    tail, byname = {}, {}
    for k, v in sites.items():
        umd, jib = k.split('|', 1)
        last = umd.split()[-1]
        if last != umd:
            tail.setdefault(f'{last}|{jib}', []).append(k)
        # 시·도는 키에 넣지 않는다. same_place 가 겹치는 구에서만 따지는데,
        # 키에 박아 두면 경산시(색인은 경북, 보드는 대구권)가 통째로 안 잡힌다.
        byname.setdefault(f"{gu_key(v['gu'])}|{nm_key(v['nm'])}", []).append(k)
    return tail, byname


def keys_of(addr, umd):
    """주소에서 (법정동, 지번) 후보를 앞선 것부터 낸다."""
    out = []
    if addr and umd:
        m = re.search(re.escape(umd) + r'\s*(?:일원\s*)?(?:산\s*)?(\d+(?:-\d+)?)', addr)
        if m:
            out.append(f'{umd}|{m.group(1)}')
    for m in _DONG.finditer(addr or ''):
        k = f'{m.group(1)}|{m.group(2)}'
        if k not in out:
            out.append(k)
    return out


def ambiguous_gu(sites):
    """시·도를 넘어 같은 이름이 있는 구. 대구 남구와 부산 남구가 그렇다."""
    by = {}
    for v in sites.values():
        by.setdefault(gu_key(v['gu']), set()).add(v.get('sd'))
    return {g for g, sd in by.items() if len(sd) > 1}


AMBIG = set()


def same_place(site, gu, sd):
    g = gu_key(gu)
    if gu_key(site.get('gu')) != g:
        return False
    # 시·도는 이름이 겹치는 구에서만 따진다.
    #
    # 보드의 r 은 시·도가 아니라 **권역**이다 — 경산시·영천시·경주시가 r='대구'
    # 로 들어와 있다. 시·도를 늘 대조하면 그 물건들이 통째로 떨어져 나간다.
    # 반대로 '남구' 처럼 대구에도 부산에도 있는 이름은 대조하지 않으면
    # 대구 단지 시세가 부산 물건에 붙는다. 겹치는 이름에서만 따진다.
    if g not in AMBIG:
        return True
    # 예전에 만든 rtms.json 에는 sd 가 없다. 없으면 구까지만 보고 통과시킨다.
    return not (sd and site.get('sd')) or site['sd'] == sd


def _one(cands, sites, gu, sd, dong=None):
    """같은 시·도·구(그리고 법정동을 알면 같은 동)의 후보가 정확히 하나일
    때만 쓴다. 이름만 같고 지번이 다르면 1차·2차처럼 **다른 단지**다."""
    c = [k for k in (cands or []) if same_place(sites[k], gu, sd)]
    if dong:
        c = [k for k in c if k.split('|', 1)[0].split()[-1] == dong]
    return sites[c[0]] if len(c) == 1 else None


def _by_name(listed, gu, sd, dong, sites, byname):
    """경매 표기 이름(listed)에 맞는 단지를 찾는다.

    한국 아파트 이름은 **앞에 지역이 붙고 뒤에 차수가 붙는다.**
      '침산동삼정그린코아' 의 '삼정그린코아'  → 접두어만 다르다. 같은 단지다.
      '대화타워펠리스2'  의 '대화타워펠리스'  → 차수가 다르다. **다른 단지다.**
    그래서 실거래가 쪽 이름이 표기의 **접미어**일 때만 받아들인다.

    다만 접미어 규칙만으로는 '태전3차우방타운' 이 '우방타운' 에 붙는다.
    '우방타운' 같은 이름은 대구에 널려 있어서, 그 구에 우연히 하나만
    수집됐다는 이유로 붙이면 엉뚱한 단지의 시세를 보여주게 된다.
    그래서 **법정동까지 같을 때만** 접미어 매칭을 허용한다. 법정동을
    모르면(도로명 표기에 괄호가 없으면) 이름이 완전히 같을 때만 붙인다.
    """
    listed = nm_key(listed)
    exact = _one(byname.get(f'{gu_key(gu)}|{listed}'), sites, gu, sd, dong)
    if exact:
        return exact
    if not dong:
        return None
    cand = []
    for key, ks in byname.items():
        g, _, nm = key.partition('|')
        # 시·도 대조는 _one 이 same_place 로 한다.
        if g != gu_key(gu) or len(nm) < 4 or nm == listed:
            continue
        if listed.endswith(nm):
            cand.append((len(nm), nm, ks))
    if not cand:
        return None
    cand.sort(reverse=True)
    if len(cand) > 1 and cand[0][0] == cand[1][0]:
        return None
    return _one(cand[0][2], sites, gu, sd, dong)


def find_site(addr, umd, gu, sd, sites, tail, byname):
    """(단지, 매칭근거). 지번 → 괄호 안 (법정동, 단지명) → 이름 완전일치 순."""
    for k in keys_of(addr, umd):
        # 법정동 이름과 지번은 도시가 다르면 얼마든지 겹친다. 지번이 맞아도
        # 시·도·구가 다르면 다른 단지다.
        if k in sites and same_place(sites[k], gu, sd):
            return sites[k], '지번'
        got = _one(tail.get(k), sites, gu, sd)
        if got:
            return got, '지번'
    m = _PAREN.search(addr or '')
    if m:
        got = _by_name(m.group(2).strip(), gu, sd, m.group(1), sites, byname)
        if got:
            return got, '단지명'
    # 괄호가 없으면 법정동을 모른다. 이름이 통째로 같을 때만 붙인다.
    dong = umd.split()[-1] if umd else None
    for tok in re.findall(r'[가-힣A-Za-z0-9]{4,}', addr or ''):
        got = _by_name(tok, gu, sd, dong, sites, byname)
        if got:
            return got, '단지명'
    return None, None


def pick_area(buckets, ar):
    """물건 면적에 가장 가까운 버킷. 없으면 None."""
    if not buckets:
        return None
    if ar is None:
        # 면적을 모르면 거래가 가장 많은 버킷으로 대신한다. 대표 평형이다.
        return max(buckets, key=lambda k: buckets[k].get('n', 0) or 0)
    cand = [(abs(int(k) - ar), k) for k in buckets]
    d, k = min(cand)
    return k if d <= AR_TOL else None


def market(site, ar):
    """단지 하나에서 물건 면적에 맞는 시세 묶음을 만든다.

    물건 면적을 모르면 그 단지에서 가장 많이 거래된 평형으로 대신한다.
    그건 **이 호수의 면적이 아니다.** 화면에서 그렇게 밝히도록 표시를 남긴다.
    """
    t = pick_area(site.get('t') or {}, ar)
    r = pick_area(site.get('r') or {}, ar)
    if not t and not r:
        return None
    mk = {'nm': site['nm'], 'gu': site['gu']}
    if ar is None:
        mk['arGuess'] = True
    if site.get('yr'):
        mk['yr'] = site['yr']
    if t:
        e = site['t'][t]
        mk['ar'] = int(t)
        mk['t'] = {k: e[k] for k in ('n', 'med', 'min', 'max', 'last', 'rows') if k in e}
    if r:
        e = site['r'][r]
        mk['r'] = dict(e)
        mk.setdefault('ar', int(r))
    return mk


def area_of(x):
    br = x.get('br') or {}
    if br.get('ar'):
        return float(br['ar'])
    v = x.get('ar')
    if v:
        m = re.search(r'\d+(?:\.\d+)?', str(v))
        if m:
            return float(m.group())
    return None


def attach(items, R, addr_k, umd_k, gu_k, area_of_, is_apt, tag, sd_k='r'):
    sites = R['sites']
    tail, byname = build_index(sites)
    st = Counter()
    for x in items:
        x.pop('mk', None)
        if not is_apt(x):
            continue
        st['아파트'] += 1
        # 색인 제목이 잘려 단지명이 일부만 들어온 물건은 이름으로 맞출 수
        # 없다. '통영청구하이' 를 '통영청구하이츠' 로 읽어 주면 안 된다.
        if x.get('addrCut'):
            st['주소 잘림'] += 1
            continue
        addr = x.get(addr_k) or ''
        umd = (x.get(umd_k) or '').strip()
        gu = (x.get(gu_k) or '').strip()
        sd = (x.get(sd_k) or '').strip()
        site, src = find_site(addr, umd, gu, sd, sites, tail, byname)
        if not site:
            st['미매칭'] += 1
            continue
        mk = market(site, area_of_(x))
        if not mk:
            st['면적불일치'] += 1
            continue
        mn = x.get('mn')
        # 평형을 모르면 비율을 내지 않는다. 이 물건의 면적을 몰라 단지 대표
        # 평형으로 대신한 값과 최저가를 나누면, 60㎡ 중앙값에 84㎡ 물건의
        # 최저가를 얹어 '시세의 147%' 같은 숫자가 나온다. 비싸서가 아니라
        # 다른 평형을 본 것인데, 화면에서는 구분되지 않는다.
        if mn and mk.get('t', {}).get('med') and not mk.get('arGuess'):
            mk['gap'] = round(mn / (mk['t']['med'] * 10000) * 100)
        # 감정가의 30% 밑까지 떨어진 물건은 시세와 직접 비교할 수 없다.
        # 유찰이 그만큼 쌓였다는 건 아무도 안 받아 갔다는 뜻이고, 대개
        # 지분매각·유치권·대항력 임차인 같은 이유가 따로 있다. 여기에
        # '시세의 2%' 라는 초록 딱지를 붙이면 정반대로 읽힌다.
        rt, f = x.get('rt'), x.get('f') or 0
        if (rt is not None and rt <= 30) or f >= 4:
            mk['deep'] = True
        mk['src'] = src
        x['mk'] = mk
        st[src] += 1
        st['붙임'] += 1
    print(f'  {tag}: ' + ' · '.join(f'{k} {v}' for k, v in st.items()), file=sys.stderr)
    return st


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()

    R = json.loads((ROOT / 'data' / 'rtms.json').read_text(encoding='utf-8'))
    print(f"rtms.json — 단지 {len(R['sites'])}곳 ({R['from']}~{R['to']})", file=sys.stderr)

    dp = ROOT / 'data' / 'data.json'
    D = json.loads(dp.read_text(encoding='utf-8'))
    attach(D, R, 'a', 'a2', 'a1', area_of, lambda x: x.get('ut') == '아파트', '법원경매')

    op = ROOT / 'data' / 'onbid.json'
    O = json.loads(op.read_text(encoding='utf-8'))
    # 온비드의 bld 는 건물명이 아니라 건물면적(㎡)이다. 이름으로 쓰면 안 된다.
    attach(O, R, 'nm', 'a2', 'a1',
           lambda x: float(x['bld']) if x.get('bld') else None,
           lambda x: x.get('scls') == '아파트', '공매')

    if not a.dry:
        dp.write_text(json.dumps(D, ensure_ascii=False), encoding='utf-8')
        op.write_text(json.dumps(O, ensure_ascii=False), encoding='utf-8')
        print(f'저장 {dp.name}, {op.name}', file=sys.stderr)


if __name__ == '__main__':
    main()
