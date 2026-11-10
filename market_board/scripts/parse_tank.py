#!/usr/bin/env python3
"""탱크옥션 '상세정보' PDF 를 보드 항목으로 바꾼다.

  pdftotext -layout <파일>.pdf -   |  scripts/parse_tank.py <txt디렉터리>

이 문서에는 지금까지 보드가 '확인할 수 없다' 고 적어온 것들이 들어 있다 —
등기부 갑구·을구의 권리 순서와 **말소기준등기**, 임차인의 **전입일·대항력**,
체납 관리비. 색인이나 CODEF 로는 못 얻던 값이다.

**실명이 그대로 들어 있다.** 소유자·채무자·임차인·채권자(개인)의 이름을
그대로 저장하면 안 된다. 여기서 곧바로 가린다 — 저장 후에 가리는 게 아니라
파싱 단계에서 가려야 원본이 어디에도 남지 않는다.
"""
import glob, json, os, re, sys, datetime

KST = datetime.timezone(datetime.timedelta(hours=9))
TODAY = datetime.datetime.now(KST).date().isoformat()

# 법인·기관은 가리지 않는다. 개인만 가린다.
_ORG = ('신협', '은행', '캐피탈', '저축', '보증', '공사', '조합', '금고', '주식회사',
        '유한', '농협', '수협', '축협', '새마을', '자산관리', '대부', '증권', '보험',
        '국민건강', '근로복지', '세무서', '시청', '구청', '군수', '공단', '재단')


def mask(name):
    """개인 이름을 성만 남기고 가린다. 기관은 그대로."""
    n = (name or '').strip()
    if not n or any(w in n for w in _ORG) or len(n) > 5:
        return n
    return n[0] + 'O' * (len(n) - 1)


def num(s):
    s = re.sub(r'[^\d]', '', s or '')
    return int(s) if s else None


def parse(t):
    d = {}
    m = re.search(r'경매\s*(20\d{2}타경\d+)', t)
    if not m:
        return None
    d['caNo'] = m.group(1)

    m = re.search(r'(대구지방법원|대구서부지원|[가-힣]{2,6}지원|[가-힣]{2,6}법원)\s*(\d+)계', t)
    if m:
        d['ct'] = m.group(1)
        d['desk'] = f'경매{m.group(2)}계'

    m = re.search(r'매각일자\s*([\d.]+)', t)
    if m:
        p = m.group(1).strip('.').split('.')
        if len(p) == 3:
            d['d'] = f'{p[0]}-{int(p[1]):02d}-{int(p[2]):02d}'

    # 소재지: 매각일자 줄 바로 다음에 온다.
    m = re.search(r'매각일자[^\n]*\n\s*([가-힣][^\n(]*?)\s*\n\s*\(도로명주소\s*:\s*([^)]+)\)', t)
    if m:
        d['a'] = re.sub(r'\s+', ' ', m.group(1)).strip()
        d['road'] = re.sub(r'\s+', ' ', m.group(2)).strip()
    else:
        m = re.search(r'매각일자[^\n]*\n\s*(대구광역시[^\n]+)', t)
        if m:
            d['a'] = re.sub(r'\s+', ' ', m.group(1)).strip()

    m = re.search(r'감정가\s+([\d,]+)', t)
    if m: d['ap'] = num(m.group(1))
    # 비율이 '(34.3%)' 처럼 소수로 오는 문서가 있다. \d+ 만 받으면 최저가를
    # 통째로 못 읽고 카드에 금액이 비어 버린다 — 2025타경1413 이 그랬다.
    m = re.search(r'최저가\s*\(([\d.]+)%\)\s*([\d,]+)', t)
    if m:
        d['rt'] = round(float(m.group(1))); d['mn'] = num(m.group(2))
    m = re.search(r'보증금\s*\(([\d.]+)%\)\s*([\d,]+)', t)
    if m:
        d['bid'] = num(m.group(2)); d['bidPct'] = round(float(m.group(1)))

    m = re.search(r'대지권\s+([\d,.]+)㎡', t)
    if m: d['land'] = float(m.group(1).replace(',', ''))
    m = re.search(r'건물면적\s+([\d,.]+)㎡', t)
    if m: d['ar'] = float(m.group(1).replace(',', ''))

    m = re.search(r'개시결정\s+([\d-]+)\(([^)]+)\)', t)
    if m: d['open'] = m.group(1); d['kind'] = m.group(2)
    m = re.search(r'사용승인일\s*:?\s*(\d{4}-\d{2}-\d{2})', t)
    if m: d['apr'] = m.group(1)
    m = re.search(r'단지명\s+(\S+)', t)
    if m: d['bld'] = m.group(1)

    # 표의 같은 줄에서 다음 칸 이름까지 확인한다. 그냥 '소유자\s+(\S+)' 로 잡으면
    # 메모의 '전소유자 문제없고' 에서 '문제없고' 를 이름으로 가져온다. 실제로 그랬다.
    for k, pat in (('owner', r'소유자\s+(\S+)\s+감정가'),
                   ('debtor', r'채무자\s+(\S+)\s+최저가'),
                   ('creditor', r'채권자\s+(\S+)\s+보증금')):
        mm = re.search(pat, t)
        if mm: d[k] = mask(mm.group(1))

    # 기일 사다리
    ld = []
    # 결과 칸은 정해진 낱말뿐이다. \S* 로 열어두면 다음 행의 'N차' 를 결과로
    # 물어온다 — 2차의 결과가 '매각결정기일' 로 잡히고 5차가 통째로 사라졌다.
    _RES = r'(유찰|매각|변경|취하|정지|기각|예정|불허가|재매각|납부|배당종결)'
    for mm in re.finditer(r'(\d+)차\s+(\d{4})[.-](\d{2})[.-](\d{2})\s+([\d,]+)'
                          r'(?:[ \t]+' + _RES + r')?[ \t]*(?=\n|$)', t):
        ld.append({'n': int(mm.group(1)),
                   'd': f'{mm.group(2)}-{mm.group(3)}-{mm.group(4)}',
                   'amt': num(mm.group(5)),
                   'r': mm.group(6)})
    # 매각불허가결정은 따로 한 줄로 온다. 해당 기일에 붙여 준다.
    for mm in re.finditer(r'매각결정기일\s*:\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\S+)', t):
        d.setdefault('decisions', []).append({'d': mm.group(1), 'r': mm.group(2)})
    if ld: d['ld'] = ld
    d['f'] = sum(1 for x in ld if x.get('r') == '유찰')

    # 말소기준등기 — 인수/소멸 판정의 기준선
    m = re.search(r'말소기준일\(소액\)\s*:\s*(\d{4}-\d{2}-\d{2})', t)
    if m: d['baseDate'] = m.group(1)
    m = re.search(r'배당요구종기일\s*:\s*(\d{4}-\d{2}-\d{2})', t)
    if m: d['distEnd'] = m.group(1)

    # 등기 권리 — 말소기준등기 줄
    for mm in re.finditer(r'([갑을])\((\d+)\)\s+(\d{4}-\d{2}-\d{2})\s+(\S+)\s+(\S+)'
                          r'(?:\s+([\d,]+))?([^\n]*)', t):
        if '말소기준등기' in mm.group(7):
            d['base'] = {'d': mm.group(3), 'kind': mm.group(4),
                         'who': mask(mm.group(5)), 'amt': num(mm.group(6) or '')}
            break

    # 임차인
    #
    # **대항력 판정을 문구로 하지 마라.** 예전에는 '인수' 와 '미배당' 이 둘 다
    # 보이면 인수로 쳤는데, 그 두 낱말이 늘 함께 나오지는 않는다. 2025타경9076
    # 은 전입 2018-11-28 이 말소기준 2022-08-09 보다 앞서 보증금 3억 5,000만을
    # 낙찰자가 인수하는 사건인데, 문서에 '인수 조건' 이라 적혀 있는데도
    # '미배당' 이 없어 takeover=False 로 나왔다. 정반대를 말한 것이다.
    #
    # 대항력은 계산으로 정한다 — **전입일이 말소기준일보다 앞서면 대항력이
    # 있다.** 문서의 대항력 칸은 근거로 함께 남긴다.
    base_d = (d.get('base') or {}).get('d') or d.get('baseDate')
    ten, seen = [], set()
    for mm in re.finditer(r'전입\s*:\s*(\d{4}-\d{2}-\d{2})', t):
        seg = t[max(0, mm.start() - 400): mm.start() + 400]
        e = {'in': mm.group(1)}
        c = re.search(r'확정\s*:\s*(\S+)', seg)
        if c: e['fix'] = c.group(1)
        b = re.search(r'배당\s*:\s*(\S+)', seg)
        if b: e['dist'] = b.group(1)
        dep = re.search(r'보\s*:\s*([\d,]+)', seg)
        if dep: e['dep'] = num(dep.group(1))
        # 문서가 적어 둔 대항력 칸. '인수조건' 은 줄바꿈으로 갈라져 오기도 한다.
        flat = re.sub(r'\s+', '', seg)
        if '인수조건' in flat or '인수' in flat:
            e['docSays'] = '인수'
        # 계산으로 정하는 대항력.
        e['take'] = bool(base_d and e['in'] < base_d)
        # 승계된 임차인이 중복으로 실린다고 문서 스스로 밝힌다. 같은 사람은 한 번만.
        k = (e['in'], e.get('dep'))
        if k in seen:
            continue
        seen.add(k)
        ten.append(e)
    if ten:
        d['ten'] = ten
        d['takeover'] = any(x.get('take') for x in ten)
        d['baseDate'] = base_d

    # 용도. 표제 줄 첫머리에 '아파트 토지·건물 일괄매각' 처럼 적혀 있다.
    m = re.search(r'^\s*(아파트|오피스텔|다세대|연립|단독주택|다가구|근린|상가|토지|대지|공장|창고)\s',
                  t, re.M)
    if m: d['ut'] = {'다세대': '빌라·다세대', '연립': '빌라·다세대',
                     '근린': '상가·근린', '상가': '상가·근린'}.get(m.group(1), m.group(1))

    # 재매각. 사다리에 '지급기한 … 미납' 이 있으면 앞선 낙찰자가 대금을 안 낸
    # 사건이다. 보증금이 10% 에서 20~30% 로 올라가고, 안 낸 데는 이유가 있을
    # 수 있다. 특이사항으로 올려야 목록·필터에서 보인다.
    if re.search(r'지급기한[^\n]*미납', t):
        d['resale'] = True
    m = re.search(r'체납금액\s+([\d,]+)', t)
    if m: d['due'] = num(m.group(1))
    m = re.search(r'공동주택공시가격\([^)]*\)\s*:\s*([\d,]+)', t)
    if m: d['pub'] = num(m.group(1))
    return d


if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else '/tmp/pz/txt'
    out = []
    for p in sorted(glob.glob(os.path.join(src, '*.txt'))):
        r = parse(open(p, encoding='utf-8', errors='replace').read())
        if r: out.append(r)
        else: print(f'파싱 실패: {os.path.basename(p)}', file=sys.stderr)
    print(json.dumps(out, ensure_ascii=False, indent=1))
