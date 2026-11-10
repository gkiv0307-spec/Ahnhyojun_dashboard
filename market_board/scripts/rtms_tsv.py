#!/usr/bin/env python3
"""실거래가 XML 을 TSV 로 편다.  rtms_tsv.py {trade|rent}  < 응답.xml

셸 안에 파이썬을 인라인으로 박아두면 따옴표 지옥이 된다. f-string 안에는
백슬래시를 못 쓰는데 셸이 강제로 이스케이프를 끼워 넣어서 조용히 깨졌다.
그래서 파일로 뺐다.
"""
import signal, sys, xml.etree.ElementTree as ET

# head 로 잘라 볼 때마다 BrokenPipeError 역추적이 튀어나온다. 파이프가
# 닫히면 조용히 끝내는 게 맞다.
signal.signal(signal.SIGPIPE, signal.SIG_DFL)

KIND = (sys.argv[1] if len(sys.argv) > 1 else 'trade').lower()

try:
    root = ET.fromstring(sys.stdin.read())
except ET.ParseError as e:
    sys.exit(f'XML 파싱 실패: {e}')

msg = (root.findtext('.//resultMsg') or root.findtext('.//errMsg') or '').strip()
if msg and msg != 'OK':
    sys.exit(f'API 오류: {msg}')


def g(it, tag):
    return (it.findtext(tag) or '').strip()


def day(it):
    y = g(it, 'dealYear')
    if not y:
        return ''
    m = int(g(it, 'dealMonth') or 0)
    d = int(g(it, 'dealDay') or 0)
    return f'{y}-{m:02d}-{d:02d}'


if KIND == 'rent':
    cols = ['단지명', '전용면적', '층', '보증금(만원)', '월세(만원)',
            '구분', '계약일', '법정동', '건축년도']
else:
    cols = ['단지명', '전용면적', '층', '거래금액(만원)', '거래일',
            '법정동', '건축년도']
print('\t'.join(cols))

n = 0
for it in root.iter('item'):
    if KIND == 'rent':
        dep = g(it, 'deposit').replace(',', '')
        rent = g(it, 'monthlyRent').replace(',', '')
        # 월세가 0 이면 전세다. 공란으로 오는 경우도 있어 둘 다 전세로 본다.
        kind = '전세' if rent in ('', '0') else '월세'
        row = [g(it, 'aptNm'), g(it, 'excluUseAr'), g(it, 'floor'),
               dep, rent, kind, day(it), g(it, 'umdNm'), g(it, 'buildYear')]
    else:
        row = [g(it, 'aptNm'), g(it, 'excluUseAr'), g(it, 'floor'),
               g(it, 'dealAmount').replace(',', ''), day(it),
               g(it, 'umdNm'), g(it, 'buildYear')]
    print('\t'.join(row))
    n += 1

print(f'({n}건)', file=sys.stderr)
