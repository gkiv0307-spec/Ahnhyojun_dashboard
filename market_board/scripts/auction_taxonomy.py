#!/usr/bin/env python3
"""법원경매 물건 용도 표준 분류.

courtauction.go.kr 검색폼의 3단 코드 체계를 따른다.
  lclsUtilCd 0000802     대분류: 건물
  mclsUtilCd 000080201   중분류: 주거용건물
  sclsUtilCd 00008020101~11  소분류

  from auction_taxonomy import classify, SCLS_CODES
  classify("광주시 초월읍 도평리 139-38 (단독주택)")
  -> ('단독주택', '주거용건물', False)      # False = 추정 아님(근거 명확)
  classify("수성구 만촌동 1429 메트로팔레스 307동 105호")
  -> ('아파트', '주거용건물', True)         # True = 기본값 추정
"""
import re

# 주거용건물 소분류 코드 (courtauction sclsUtilCd)
SCLS_CODES = {
    '단독주택':   '00008020101',
    '다가구주택': '00008020102',
    '다중주택':   '00008020103',
    '아파트':     '00008020104',
    '연립주택':   '00008020105',
    '다세대주택': '00008020106',
    '기숙사':     '00008020107',
    '빌라':       '00008020108',
    '상가주택':   '00008020109',
    '오피스텔':   '00008020110',
    '주상복합':   '00008020111',
}
MCLS_RESIDENTIAL = '000080201'
LCLS_BUILDING = '0000802'

# 소재지·비고 문구에서 용도를 짚어내는 규칙. 위에서부터 먼저 맞는 것을 쓴다.
_RULES = [
    (re.compile(r'오피스텔'),                        '오피스텔',   '주거용건물'),
    (re.compile(r'주상복합'),                        '주상복합',   '주거용건물'),
    (re.compile(r'다세대|빌라'),                     '다세대주택', '주거용건물'),
    (re.compile(r'연립'),                            '연립주택',   '주거용건물'),
    (re.compile(r'다가구'),                          '다가구주택', '주거용건물'),
    (re.compile(r'단독주택'),                        '단독주택',   '주거용건물'),
    (re.compile(r'상가주택'),                        '상가주택',   '주거용건물'),
    (re.compile(r'상가|근린|빌딩'),                  '상가·근린',  '업무·상업용건물'),
    (re.compile(r'임야|전답|대지(?!권)'),            '토지',       '토지'),
]


def classify(text):
    """(소분류, 대분류, 추정여부) 를 돌려준다.

    문구에 용도가 드러나면 추정여부 False, 아무 단서도 없으면
    '아파트' 로 기본 처리하고 True 를 준다. 아파트 검색으로 모은
    표본이라 기본값이 아파트이지만, 확정된 값과 반드시 구분해야 한다.
    """
    t = text or ''
    for pat, scls, mcls in _RULES:
        if pat.search(t):
            return scls, mcls, False
    return '아파트', '주거용건물', True


# 원본 비고란에서 뽑을 특수권리. 지금 수집 경로(네이버 색인)에는
# 비고 필드가 없어 채워지지 않는다. CODEF 의 resNote / resDetailList[].resNote
# 가 들어오면 여기서 뽑아 쓴다.
SPECIAL_RIGHTS = [
    '지분매각', '지분경매', '법정지상권', '유치권', '분묘기지권',
    '별도등기', '재매각', '특별매각조건', '농지취득', '예고등기',
    '선순위', '우선매수신고', '맹지',
    # 아래 셋은 낙찰자가 돈을 더 물어야 하는 항목이라 빠지면 안 된다.
    # 매각물건명세서 비고에 그대로 적혀 나온다.
    '대항력', '대지권미등기', '토지별도등기',
]


def special_rights(note):
    """비고 문구에서 특수권리를 뽑는다. 없으면 빈 리스트."""
    t = note or ''
    return [r for r in SPECIAL_RIGHTS if r in t]


if __name__ == '__main__':
    import sys
    for line in sys.stdin:
        line = line.rstrip('\n')
        if line:
            print(f'{line}\t-> {classify(line)}  특수권리={special_rights(line)}')
