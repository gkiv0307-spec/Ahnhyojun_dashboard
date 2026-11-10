#!/usr/bin/env python3
"""매각물건명세서 비고 등 자유서술에 남은 자연인 실명을 마스킹한다.

CODEF 는 당사자 목록(resInvolvedPersonList)·문건접수내역의 이름은 `김OO` 로
가려서 주지만, **매각물건명세서 비고(resProductList[].resNote)의 자유서술은
법원 문서 그대로 통과시킨다.** 실제로 2026-08-26 수집분에서 두 건이 나왔다.

  · "유치권자 이성현이 2026. 5. 6. 유치권신고(권리신고액 금 83,300,000원)"
  · "신청채권자 주택도시보증공사(주택임차권자 문한준의 양수인)"

경매기록은 공개 자료지만, 그것과 개인 이름을 웹페이지에 올려 색인되게 하는
것은 다른 문제다. 화면에 싣기 전에 반드시 이걸 통과시킨다.

법인은 가리지 않는다. 유치권을 신고한 회사가 어디인지, 채권자가 어느
은행인지는 입찰 판단에 필요한 정보다.
"""
import re

# 역할어 뒤에 오는 2~4자 한글을 인명 후보로 본다.
_ROLE = ('임차권자', '임차인', '전세권자', '소유자', '채무자', '채권자', '신청채권자',
         '유치권자', '신청인', '양수인', '매수인', '매수신청인', '교부권자', '점유자',
         '공유자', '상속인', '대리인')
# 법인·기관을 가리키는 꼬리. 이게 붙으면 자연인이 아니다.
_ORG = ('주식회사', '유한회사', '유한책임회사', '합자회사', '합명회사', '은행', '공사',
        '조합', '금고', '신협', '농협', '수협', '축협', '새마을금고', '캐피탈', '저축',
        '보증', '보험', '증권', '자산관리', '유동화', '대부', '홀딩스', '법무법인',
        '세무법인', '재단', '사단', '학교', '교회', '시청', '구청', '군청', '세무서',
        '공단', '공제회', '연금', '기금', '지사', '지점', '본부', '센터')
# 조사 목록을 느슨하게 잡으면 '주택도시보증공사' 가 '주택'+'도' 로 잘려 법인이
# 인명으로 둔갑한다. 조사는 딱 붙는 것만 받고, 그 뒤에 반드시 경계가 와야 한다.
# 이름 부분은 비탐욕(2자부터)으로 늘려 '이성현이' 에서 조사 '이' 를 빼앗기지 않게 한다.
# 역할어와 이름 사이에는 **반드시 공백이 있어야 한다**. \s* 로 두면 역할어가
# 더 긴 낱말의 앞토막일 때 그 뒤 형태소를 이름으로 읽는다 — 2026-09-22 에
# '압류채권자로부터 금 235,500,000원' 이 '압류채권자 로OO 금 …' 이 되어
# 없는 사람이 생겼다. 법원 문서는 당사자 이름을 역할어와 띄어 쓴다.
_ROLE_RE = re.compile(
    r'(' + '|'.join(sorted(_ROLE, key=len, reverse=True)) + r')(\s+)'
    r'([가-힣]{2,4}?)'
    r'([이가은는을를와과의]|씨|님)?'
    r'(?=[\s,\.\)\(·]|$)')

# 역할어 뒤에 띄어 써서 오는데 이름이 아닌 말들. 이것까지 가리면 문장이
# 망가진다 — '임차인 있음' → '임차인 있O', '소유자 미상의' → '소유자 미O의'.
# 사람 이름으로 쓰일 수 없는 말만 넣는다.
_NOT_NAME = (
    '있음', '있는', '있을', '있고', '없음', '없는', '미상', '불명', '불분명',
    '우선매수', '우선변제', '전원', '전부', '일부', '본인', '다수', '미정',
    '해당', '동일', '상동', '각자', '모두', '연대', '겸', '측', '외',
)


def _is_org(text, start, name):
    """이름 뒤에 법인 꼬리가 곧바로 붙어 있으면 법인으로 본다."""
    tail = text[start:start + 40]
    return any(o in tail for o in _ORG) and tail.find(name) <= 1 or \
        any(name.endswith(o) or name.startswith(o) for o in _ORG)


def mask(text):
    """자연인 이름을 `홍OO` 꼴로 가린다. 법인·기관은 그대로 둔다."""
    if not text:
        return text

    def sub(m):
        role, gap, name = m.group(1), m.group(2), m.group(3)
        after = text[m.end(3):m.end(3) + 30]
        # 뒤에 법인 꼬리가 이어지면 이름이 아니라 상호의 앞부분이다.
        if any(after.lstrip().startswith(o) for o in _ORG):
            return m.group(0)
        if any(o in name for o in _ORG):
            return m.group(0)
        # 이름이 아닌 말은 건드리지 않는다.
        if name in _NOT_NAME or any(name.startswith(w) for w in _NOT_NAME):
            return m.group(0)
        part = m.group(4) or ''
        # 띄어쓰기는 원문 그대로 되돌린다. 늘 한 칸으로 바꾸면 원문이 두 칸을
        # 쓰거나 줄바꿈을 쓴 자리에서 문서가 미묘하게 달라진다.
        return f'{role}{gap}{name[0]}{"O" * (len(name) - 1)}{part}'

    return _ROLE_RE.sub(sub, text)


def sweep(paths=('data/data.json', 'data/onbid.json')):
    """data.json·onbid.json 의 자유서술 필드를 실제로 가린다.

    2026-09-22 까지 이 파일의 __main__ 은 자기검사만 돌고 있었다. daily.sh 는
    이것을 부르고 있었지만(50행) 아무것도 가리지 않았고, apply_codef 의 주석
    "mask_names.py 가 뒤에서 이름을 가린다"(115행) 는 지켜지지 않는 약속이었다.
    그 사이 prodNote 를 통해 임차인·소유자 실명 17명이 data.json 과 빌드된
    현황판에 그대로 실려 나갔다. build_detail 은 s() 에서 mask 를 통과시키므로
    detail.json 만 깨끗했다 — 한쪽만 막아 둔 것이 더 위험했다.

    가릴 필드는 CODEF 가 법원 문서 그대로 넘겨주는 자유서술뿐이다.
    resultDesc·state 는 '유찰'·'매각허가결정' 같은 정형 문구라 건드리지 않는다.
    """
    import json, os
    FIELDS = ('note', 'prodNote', 'caseName')
    total = 0
    for path in paths:
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as f:
            doc = json.load(f)
        items = doc if isinstance(doc, list) else doc.get('items', [])
        n = 0
        for it in items:
            for k in FIELDS:
                v = it.get(k)
                if isinstance(v, str) and v:
                    m = mask(v)
                    if m != v:
                        it[k] = m
                        n += 1
        if n:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(doc, f, ensure_ascii=False)
        print(f'  {path} — {len(items)}건 중 {n}곳 가림')
        total += n
    return total


if __name__ == '__main__':
    import sys
    T = [
        ('유치권자 영선홀딩스 주식회사가 유치권신고', '유치권자 영선홀딩스 주식회사가 유치권신고'),
        ('유치권자 이성현이 2026. 5. 6. 유치권신고', '유치권자 이OO이 2026. 5. 6. 유치권신고'),
        ('신청채권자 주택도시보증공사(주택임차권자 문한준의 양수인)',
         '신청채권자 주택도시보증공사(주택임차권자 문OO의 양수인)'),
        ('채권자 중소기업은행의 승계인', '채권자 중소기업은행의 승계인'),
        ('임차인 김OO 권리신고', '임차인 김OO 권리신고'),
        ('소유자 이OO이 자가 거주 중', '소유자 이OO이 자가 거주 중'),
        # 아래는 2026-09-22 에 실제로 망가진 것들이다. 다시 깨지면 여기서 잡힌다.
        ('압류채권자로부터 금 235,500,000원의 매수신청의 보증이 있음',
         '압류채권자로부터 금 235,500,000원의 매수신청의 보증이 있음'),
        ('채권자로부터 취하서 제출', '채권자로부터 취하서 제출'),
        ('임대차관계 불분명한 임차인 있음.', '임대차관계 불분명한 임차인 있음.'),
        ('소유자 미상의 컨테이너', '소유자 미상의 컨테이너'),
        ('임차인 우선매수 신고', '임차인 우선매수 신고'),
        ('공유자 우선매수권 있음(행사제한 1회).', '공유자 우선매수권 있음(행사제한 1회).'),
    ]
    bad = 0
    for src, want in T:
        got = mask(src)
        ok = got == want
        bad += not ok
        print(('✓' if ok else '✗'), got, ('' if ok else f'  기대: {want}'))
    print(f'{len(T)-bad}/{len(T)} 자기검사 통과')
    if bad:
        # 규칙이 깨진 채로 훑으면 잘못 가린 결과를 파일에 굳힌다.
        print('자기검사 실패 — 가리기를 건너뜁니다')
        sys.exit(1)
    sweep()
