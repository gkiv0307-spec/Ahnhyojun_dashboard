#!/usr/bin/env python3
"""아파트 물건에 '권리 자국' 등급(screen)을 매긴다.

  scripts/screen_clean.py          # data.json 에 반영
  scripts/screen_clean.py --dry    # 세어만 본다

**이건 권리분석이 아니다.** 등기부를 떼지도, 매각물건명세서를 읽지도 않는다.
가진 재료로 '문제가 있을 때 겉으로 드러나는 자국' 이 있나 없나만 본다.

  clean   자국이 없고 유찰이 1회 이하다. 살펴볼 값어치가 있다는 뜻이지
          권리에 문제가 없다는 뜻이 아니다.
  risk    자국이 있다. 특이사항이 붙었거나, 대항력 임차인이 있거나,
          유찰이 2회 이상 쌓였다.
  (없음)  유찰 횟수도 최저가율도 몰라 판정할 수 없다. 모르는 것을 clean 에
          넣으면 목록 전체가 거짓말이 된다.

근거(screenBy)도 같이 남긴다. 법원 원본을 대조한 물건의 '자국 없음' 과
색인만 보고 매긴 '자국 없음' 은 무게가 다르다.
"""
import argparse, json, pathlib, re
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent

# 메모에 이 말이 보이면 자국으로 친다. sp 로 정리되지 않고 note 에만 적힌
# 경우가 흔하다 — '별도등기 있음.' 처럼.
RISK_NOTE = re.compile(r'유치권|법정지상권|지분|대항력|선순위|재매각|별도등기|분묘|'
                       r'예고등기|농지취득|맹지|위반건축물|가처분|특별매각조건|'
                       r'매각불허가|우선매수|전세권')

# 대항력이 적혀 있어도 매수인이 떠안지 않는 경우(2026-10-07 사용자 지시 "대항력이 있어도
# 권리상 문제가 없는 부분들도 있는데 이것도 포함시켜도 돼"). 법원 문서에 그렇게 적힌
# 경우만 인정한다 — 추측하지 않는다.
#   ① 대항력 포기 확약: 주택도시보증공사(HUG) 등 임차권 승계인이 '우선변제권만 주장하고
#      대항력을 포기하며 임차권등기 말소에 동의' 하는 확약서를 냈다(실제 보드 31건이 이 꼴).
#   ② 대항력 없음: '대항력 없는 임차인' 처럼 부정으로 적힌 경우.
# 배당요구·전액 배당 예상 같은 계산이 필요한 경우는 여기서 판단하지 않는다(사람 몫).
WAIVE = re.compile(r'대항력\s*[을은를이]?\s*포기|대항력포기')
NO_DH = re.compile(r'대항력\s*(?:이|은|을)?\s*없')


def dh_cleared(text):
    """비고·메모가 대항력을 매수인이 인수하지 않는다고 적고 있으면 그 근거를, 아니면 None."""
    t = text or ''
    if WAIVE.search(t) and re.search(r'확약|말소', t):
        return '대항력 포기 확약'
    if NO_DH.search(t) and not re.search(r'대항력\s*(?:이|을)?\s*있', t):
        return '대항력 없음'
    return None


# 유찰이 2회를 넘으면 아무도 안 받아 갔다는 뜻이다. 그 이유가 권리인 경우가
# 많다. 유찰 횟수를 모르면 최저가율로 대신한다 — 0.8²=64%, 0.7²=49% 라
# 70% 아래면 최소 2회다.
MAX_FAIL = 1
RATE_FLOOR = 70


def grade(x):
    """(등급, 근거). 등급이 None 이면 판정 불가다."""
    if x.get('ut') != '아파트':
        return None, None
    # 이미 끝난 사건은 선별할 이유가 없다. 살 수 없는 물건이다.
    if x.get('st') in ('종료', '매각'):
        return None, None

    text = ' '.join(str(x.get(k) or '') for k in ('prodNote', 'note'))
    cleared = dh_cleared(text) if '대항력' in (x.get('sp') or []) or '대항력' in text else None
    sp = [t for t in (x.get('sp') or []) if not (cleared and t == '대항력')]
    if sp:
        return 'risk', '특이사항 ' + '·'.join(sp)
    hits = set(RISK_NOTE.findall(x.get('note') or ''))
    if cleared:
        hits.discard('대항력')
    if hits:
        return 'risk', '메모에 권리 위험 표기'
    # 탱크옥션 상세를 받아둔 물건은 임차인 대항력을 직접 볼 수 있다.
    tk = x.get('tank') or {}
    if tk.get('takeover'):
        return 'risk', '전입일이 말소기준등기보다 앞선 임차인'

    f = x.get('f')
    if f is not None:
        if f > MAX_FAIL:
            return 'risk', f'유찰 {f}회'
        return 'clean', ('법원 대조 · 유찰 %d회' % f if x.get('verified')
                         else '색인 · 유찰 %d회' % f) + (f' · {cleared}' if cleared else '')

    ap, mn = x.get('ap'), x.get('mn')
    if ap and mn:
        rt = round(mn / ap * 100)
        if rt < RATE_FLOOR:
            return 'risk', f'최저가율 {rt}% (유찰 2회 이상)'
        return 'clean', f'색인 · 최저가율 {rt}%' + (f' · {cleared}' if cleared else '')
    return None, None


def main():
    a = argparse.ArgumentParser()
    a.add_argument('--dry', action='store_true')
    a = a.parse_args()

    dp = ROOT / 'data' / 'data.json'
    D = json.loads(dp.read_text(encoding='utf-8'))
    st = Counter()
    for x in D:
        # 매번 다시 매긴다. 예전 값이 남으면 CODEF 로 특이사항이 새로 붙은
        # 물건이 계속 '자국 없음' 으로 남는다.
        x.pop('screen', None)
        x.pop('screenBy', None)
        g, why = grade(x)
        if not g:
            st['판정 불가' if x.get('ut') == '아파트' else '아파트 아님/종료'] += 1
            continue
        x['screen'] = g
        x['screenBy'] = why
        st[g] += 1
        if g == 'clean':
            st['  ├ 법원 대조' if x.get('verified') else '  ├ 색인만'] += 1

    print(' · '.join(f'{k} {v}' for k, v in st.most_common()))
    if not a.dry:
        dp.write_text(json.dumps(D, ensure_ascii=False), encoding='utf-8')
        print(f'저장 {dp.name}')


if __name__ == '__main__':
    main()
