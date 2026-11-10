#!/usr/bin/env python3
"""경매 물건의 사건번호·주소를 구조화한다.

guriguri/cauca 의 데이터 모델을 따른다.
  - (법원, 사건번호, 물건번호) 복합 유니크 키
  - 주소를 시군구 / 읍면동으로 분해

  from parse_auction import split_case, split_addr, uid
  split_case("2024타경105734 [9]")   -> ("2024타경105734", 9, True)
  split_addr("수성구 만촌동 1429 …")  -> ("수성구", "만촌동")
  uid("대구지방법원", "2025타경8313", 1) -> "대구지방법원|2025타경8313|1"
"""
import re

SIDO = (r'(?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시'
        r'|세종특별자치시|경기도|강원(?:특별자치)?도|충청[북남]도|전라[북남]도'
        r'|전북특별자치도|경상[북남]도|제주특별자치도)')

# 법정동의 '~가' 는 반드시 숫자를 동반한다(수성동1가, 신흥동3가).
# 이 조건이 없으면 '(상가)' 같은 괄호 주석을 읍면동으로 오인한다.
_DONG = re.compile(r'^(?:[가-힣]+[0-9]+가|[가-힣]+[동읍면리])$')
_SKIP = {'행복센터', '행정복지센터'}


def split_case(case):
    """'2024타경105734 [9]' -> ('2024타경105734', 9, True)

    반환: (사건번호, 물건번호, 원본에 물건번호가 명시돼 있었는지)
    """
    m = re.match(r'^\s*(.+?)\s*\[(\d+)\]\s*$', case or '')
    if m:
        return m.group(1).strip(), int(m.group(2)), True
    return (case or '').strip(), 1, False


def split_addr(addr):
    """주소 문자열에서 (시군구, 읍면동) 을 뽑는다. 못 뽑으면 None.

    '성남시 분당구' 처럼 시+구가 함께 오면 붙여서 반환한다.
    도로명주소라 읍면동이 없으면 괄호 안의 법정동을 찾아본다.
    """
    if not addr or re.search(r'미색인|미확인', addr):
        return None, None
    s = re.sub(r'^\s*' + SIDO + r'\s*', '', addr).strip()
    if not s:
        return None, None

    toks = re.split(r'[\s,]+', s)
    a1, rest = None, []
    for i, tok in enumerate(toks):
        t = tok.strip('()')
        if re.match(r'^[가-힣]+[구군]$', t):
            prev = toks[i - 1].strip('()') if i else ''
            a1 = f'{prev} {t}' if re.match(r'^[가-힣]+시$', prev) else t
            rest = toks[i + 1:]
            break
        if re.match(r'^[가-힣]+시$', t):
            nxt = toks[i + 1].strip('()') if i + 1 < len(toks) else ''
            if not re.match(r'^[가-힣]+구$', nxt):   # '수원시 권선구' 는 다음 턴에 잡는다
                a1, rest = t, toks[i + 1:]
                break
    if a1 is None:
        return None, None

    for tok in rest:
        t = tok.strip('(),')
        if _DONG.match(t) and t not in _SKIP:
            return a1, t

    m = re.search(r'[（(]\s*((?:[가-힣]+[0-9]+가|[가-힣]+[동읍면리]))\s*[,)）]', addr)
    return a1, (m.group(1) if m else None)


def uid(court, case_no, item_no=1):
    """물건 단위 유니크 키. CODEF 원본 검증의 매칭 기준."""
    return f'{court}|{case_no}|{item_no}'


if __name__ == '__main__':
    import sys
    for line in sys.stdin:
        line = line.rstrip('\n')
        if not line:
            continue
        print(f'{line}\t-> {split_addr(line)}')
