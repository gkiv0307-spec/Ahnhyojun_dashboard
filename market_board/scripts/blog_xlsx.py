# -*- coding: utf-8 -*-
"""블로그컨텐츠 탭 후보를 엑셀로 굽는다 — 대구권 아파트, 시군구별.

  node scripts/blog_extract.mjs 15 > /tmp/blog.json
  python3 scripts/blog_xlsx.py /tmp/blog.json [출력.xlsx]

판정은 blog_extract.mjs 가 페이지에서 그대로 가져온다. 여기서는 자르고
꾸미기만 한다 — **결격 판정을 여기에 다시 쓰지 마라.**

기일 경계는 KST 로 다시 자른다. 페이지의 TODAY 는 브라우저 로컬 날짜라
UTC 컨테이너에서는 하루 뒤처진다.

빈 칸은 '모른다'는 뜻이다. 0 이나 추정치로 채우지 마라.

주의: 이 컨테이너의 LibreOffice 는 openpyxl 이 만든 파일을 못 연다(최소
파일로도 재현). recalc.py 를 돌릴 수 없으므로 수식 셀에 캐시값이 없다.
엑셀에서 열면 그 자리에서 계산되지만, 캐시값을 읽는 도구(pandas 등)에는
빈 칸으로 보인다. 수식을 값으로 바꾸지 마라 — 행을 지우면 요약이 따라
움직여야 한다.
"""
import json, datetime, sys
from collections import OrderedDict
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/blog.json'
o = json.load(open(SRC, encoding='utf-8'))
LEAD = o.get('lead', 15)
K = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9))
TODAY = K.date()
LIM = (TODAY + datetime.timedelta(days=LEAD)).isoformat()

rows = [r for r in o['rows'] if not r['faults'] and r['d'] >= LIM]

# 대구광역시 8개 구·군 순서 (행정 순)
ORDER = ['중구','동구','서구','남구','북구','수성구','달서구','달성군','군위군']
rows.sort(key=lambda r: (ORDER.index(r['a1']) if r['a1'] in ORDER else 99, r['d'], r['caNo']))

THIN = Side(style='thin', color='D8DCE3')
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
HEAD_FILL = PatternFill('solid', fgColor='11304A')
GU_FILL = PatternFill('solid', fgColor='EAEFF4')
GM_FILL = PatternFill('solid', fgColor='F4EFFA')
FONT = 'Arial'

def style_head(ws, ncol, row=1):
    for c in range(1, ncol + 1):
        cell = ws.cell(row=row, column=c)
        cell.font = Font(name=FONT, bold=True, size=10, color='FFFFFF')
        cell.fill = HEAD_FILL
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        cell.border = BORDER

wb = Workbook()

# ─────────────────────────── 시트 1: 목록 ───────────────────────────
ws = wb.active
ws.title = '목록'
HDR = ['시군구','읍면동','출처','사건·공고번호','물건','소재지','단지명',
       '매각기일/입찰마감','남은일수','감정가(원)','최저가(원)','최저가율(%)',
       '유찰','전용면적','실거래 중앙값(만원)','거래건수','최저가/시세(%)',
       '법원 대조','선별 등급','비고']
ws.append(HDR)
style_head(ws, len(HDR))

def dleft(d):
    return (datetime.date.fromisoformat(d) - TODAY).days

for r in rows:
    note = []
    if r['gm']:
        note.append('공매 — 등기·임차인 정보 없음, 인도명령 없음')
    if not r['verified']:
        note.append('법원 원본 대조 전')
    if not r['ar']:
        note.append('전용면적 미색인')
    if r['mkT'] is None:
        note.append('실거래 미매칭')
    elif r['arGuess']:
        note.append('시세는 단지 대표 평형 기준')
    ws.append([
        r['a1'], r['a2'], '공매' if r['gm'] else '법원경매',
        r['caNo'], (f"물건 {r['ino']}" if r['ino'] != '' else ''),
        r['addr'], (r['mkNm'] or r['nm'] or ''),
        r['d'], dleft(r['d']),
        r['ap'], r['mn'], r['rt'], r['f'],
        r['ar'] or '', r['mkT'], r['mkN'],
        (None if r['arGuess'] else r['gap']),
        'O' if r['verified'] else '',
        {'clean': '권리 자국 없음', 'risk': '위험 표시'}.get(r['screen'], ''),
        ' · '.join(note),
    ])

MONEY = '#,##0'
for i, r in enumerate(rows, start=2):
    for c in range(1, len(HDR) + 1):
        cell = ws.cell(row=i, column=c)
        cell.font = Font(name=FONT, size=10)
        cell.border = BORDER
        cell.alignment = Alignment(vertical='center')
        if r['gm']:
            cell.fill = GM_FILL
    for c in (10, 11, 15):
        ws.cell(row=i, column=c).number_format = MONEY
        ws.cell(row=i, column=c).alignment = Alignment(horizontal='right')
    for c in (9, 12, 13, 16, 17):
        ws.cell(row=i, column=c).alignment = Alignment(horizontal='right')
    for c in (1, 3, 5, 18, 19):
        ws.cell(row=i, column=c).alignment = Alignment(horizontal='center')
    ws.cell(row=i, column=1).fill = GU_FILL if not r['gm'] else GM_FILL
    ws.cell(row=i, column=1).font = Font(name=FONT, size=10, bold=True)

# 합계 줄 — 수식으로 둔다
last = len(rows) + 1
tot = last + 1
ws.cell(row=tot, column=1, value='합계 / 평균').font = Font(name=FONT, bold=True, size=10)
ws.cell(row=tot, column=10, value=f'=SUM(J2:J{last})').number_format = MONEY
ws.cell(row=tot, column=11, value=f'=SUM(K2:K{last})').number_format = MONEY
ws.cell(row=tot, column=12, value=f'=IFERROR(AVERAGE(L2:L{last}),"")').number_format = '0.0'
ws.cell(row=tot, column=17, value=f'=IFERROR(AVERAGE(Q2:Q{last}),"")').number_format = '0.0'
for c in range(1, len(HDR) + 1):
    cell = ws.cell(row=tot, column=c)
    cell.font = Font(name=FONT, bold=True, size=10)
    cell.border = Border(top=Side(style='medium', color='11304A'))

WID = [9, 11, 10, 17, 8, 46, 22, 15, 10, 15, 15, 11, 7, 12, 17, 10, 14, 9, 15, 46]
for i, w in enumerate(WID, start=1):
    ws.column_dimensions[get_column_letter(i)].width = w
ws.freeze_panes = 'A2'
ws.auto_filter.ref = f'A1:{get_column_letter(len(HDR))}{last}'
ws.row_dimensions[1].height = 30

# ─────────────────────── 시트 2: 시군구 요약 ───────────────────────
ws2 = wb.create_sheet('시군구 요약')
H2 = ['시군구', '건수', '법원경매', '공매', '최저가 합계(원)', '최저가 평균(원)', '최저가율 평균(%)']
ws2.append(H2)
style_head(ws2, len(H2))

gus = OrderedDict()
for r in rows:
    gus.setdefault(r['a1'], []).append(r)

rn = 2
for gu, rs in gus.items():
    # 목록 시트를 참조하는 수식으로 둔다 — 목록을 고치면 요약도 따라온다.
    ws2.cell(row=rn, column=1, value=gu)
    ws2.cell(row=rn, column=2, value=f"=COUNTIF(목록!$A$2:$A${last},$A{rn})")
    ws2.cell(row=rn, column=3, value=f'=COUNTIFS(목록!$A$2:$A${last},$A{rn},목록!$C$2:$C${last},"법원경매")')
    ws2.cell(row=rn, column=4, value=f'=COUNTIFS(목록!$A$2:$A${last},$A{rn},목록!$C$2:$C${last},"공매")')
    ws2.cell(row=rn, column=5, value=f"=SUMIF(목록!$A$2:$A${last},$A{rn},목록!$K$2:$K${last})")
    ws2.cell(row=rn, column=6, value=f"=IFERROR($E{rn}/$B{rn},\"\")")
    ws2.cell(row=rn, column=7, value=f"=IFERROR(SUMIF(목록!$A$2:$A${last},$A{rn},목록!$L$2:$L${last})/$B{rn},\"\")")
    rn += 1

sub = rn
ws2.cell(row=sub, column=1, value='합계')
ws2.cell(row=sub, column=2, value=f'=SUM(B2:B{rn-1})')
ws2.cell(row=sub, column=3, value=f'=SUM(C2:C{rn-1})')
ws2.cell(row=sub, column=4, value=f'=SUM(D2:D{rn-1})')
ws2.cell(row=sub, column=5, value=f'=SUM(E2:E{rn-1})')
ws2.cell(row=sub, column=6, value=f'=IFERROR(E{sub}/B{sub},"")')
ws2.cell(row=sub, column=7, value=f'=IFERROR(AVERAGE(목록!$L$2:$L${last}),"")')

for r_ in range(2, sub + 1):
    for c in range(1, len(H2) + 1):
        cell = ws2.cell(row=r_, column=c)
        cell.font = Font(name=FONT, size=10, bold=(r_ == sub))
        cell.border = BORDER
        if c in (5, 6):
            cell.number_format = MONEY
        if c == 7:
            cell.number_format = '0.0'
        if c >= 2:
            cell.alignment = Alignment(horizontal='right')
        else:
            cell.alignment = Alignment(horizontal='center')
for i, w in enumerate([12, 8, 11, 8, 18, 18, 16], start=1):
    ws2.column_dimensions[get_column_letter(i)].width = w
ws2.row_dimensions[1].height = 30

# ─────────────────────── 시트 3: 이 표에 대하여 ───────────────────────
ws3 = wb.create_sheet('이 표에 대하여')
ws3.column_dimensions['A'].width = 20
ws3.column_dimensions['B'].width = 104
LINES = [
    ('제목', f'블로그컨텐츠 후보 — 대구권 아파트, 매각기일 {LEAD}일 이상'),
    ('기준 시각', f"{K.strftime('%Y-%m-%d %H:%M')} KST"),
    ('추출 기준일', f"{TODAY.isoformat()} · 매각기일(공매는 입찰마감)이 {LIM} 이후인 물건"),
    ('지역', '대구광역시 8개 구·군만. 보드의 권역 "대구"에 들어 있는 경산·구미·포항 등 경북은 뺐습니다.'),
    ('용도', '아파트만. 오피스텔·주상복합·다세대는 권리관계와 시세 비교 방식이 달라 제외합니다.'),
    ('선별', '현황판 블로그컨텐츠 탭의 결격 판정을 그대로 적용해 결격 사유가 하나도 없는 물건만 남겼습니다.'),
    ('', ''),
    ('결격 사유(법원경매)', '법원 원본 대조 안 됨 · 특수권리 있음 · 감정가/최저가 미확정 · 최저가율 30% 미만 · 유찰 3회 이상 · 감정가가 실거래의 110% 초과 · 사건 상세 미수집 · 임차인 수 > 배당요구 건수 · 유치권 신고'),
    ('결격 사유(공매)', '처분방식이 매각이 아님 · 감정가/최저가 미확정 · 최저가율 30% 미만 등'),
    ('', ''),
    ('⚠ 이 표가 뜻하는 것',
     '"확인된 문제가 없다"는 뜻이지 "문제가 없다"는 뜻이 아닙니다. 등기부 갑구·을구가 없어 말소기준권리와 인수/소멸은 애초에 판정 대상이 아닙니다. 임차인의 전입일·확정일자·보증금도 매각물건명세서 원본에 있어 확인할 수 없습니다.'),
    ('⚠ 공매(보라색 행)',
     '온비드 목록에는 등기부 권리관계도 임차인 정보도 없습니다. 법원경매는 문건접수내역으로 배당요구·유치권신고를 볼 수 있지만 공매는 그마저 없습니다. 게다가 공매는 인도명령이 없어 명도를 직접 해결해야 합니다. 공매 행의 "결격 없음"은 법원경매보다 훨씬 약한 말입니다.'),
    ('⚠ 입찰 전',
     '반드시 대법원 법원경매정보 / 온비드 원본으로 다시 확인하십시오. 이 표는 볼 물건을 추리는 용도입니다.'),
    ('', ''),
    ('출처', '물건 발굴 = 네이버 웹문서 색인(나이스옥션 등) · 원본 대조 = 대법원 경매사건검색 · 시세 = 국토교통부 아파트 매매 실거래가 · 전용면적 = 건축물대장 · 공매 = 온비드'),
    ('실거래 중앙값', '같은 지번·같은 평형 매매 거래의 중앙값(만원). 거래건수가 1~2건이면 중앙값의 의미가 약합니다.'),
    ('최저가/시세', '최저가 ÷ 실거래 중앙값. 면적을 몰라 단지 대표 평형으로 대신한 물건은 비교가 성립하지 않아 비워 뒀습니다.'),
    ('빈 칸', '값을 모른다는 뜻입니다. 0이나 추정치로 채우지 않았습니다.'),
]
for i, (k, v) in enumerate(LINES, start=1):
    a = ws3.cell(row=i, column=1, value=k)
    bcell = ws3.cell(row=i, column=2, value=v)
    a.font = Font(name=FONT, size=10, bold=True, color='11304A')
    bcell.font = Font(name=FONT, size=10)
    bcell.alignment = Alignment(wrap_text=True, vertical='top')
    a.alignment = Alignment(vertical='top')
    if len(v) > 90:
        ws3.row_dimensions[i].height = 15 * (len(v) // 90 + 1)

out = (sys.argv[2] if len(sys.argv) > 2
       else f'대구권_블로그후보_아파트_{LEAD}일이상.xlsx')
wb.save(out)
print('저장', out, '·', len(rows), '건 ·', len(gus), '개 구·군')
