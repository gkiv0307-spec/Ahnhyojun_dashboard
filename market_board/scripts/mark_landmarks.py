#!/usr/bin/env python3
"""대장 단지에 lm=true 를 단다.

  scripts/mark_landmarks.py          # data.json 에 반영
  scripts/mark_landmarks.py --dry    # 세어만 본다

명부는 data/landmarks.json (권역별 단지명 목록). 건물명(br.bld · tx.nm · mk.nm)과
주소(a)에서 공백을 뺀 문자열에 단지명(공백 뺀 것)이 들어 있으면 대장 단지로 본다.
매번 다시 매긴다 — 명부에서 이름을 빼면 표시도 빠진다. 아파트가 아닌 물건(상가동·
오피스텔·주차장)은 이름이 같아도 달지 않는다.

현황판은 lm 이 있는 물건 앞에 ⭐ 를 붙이고, dash_sync.py --auto 가 이 중 권리 자국이
없는(screen=clean · 법원 대조) 진행중 물건을 안효준 대리 대시보드에 자동 등록한다.
"""
import argparse, json, pathlib, re
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
_WS = re.compile(r'\s+')


def _sq(s):
    return _WS.sub('', str(s or '')).lower()


def load_names():
    L = json.loads((ROOT / 'data' / 'landmarks.json').read_text(encoding='utf-8'))
    return {r: [(_sq(n), n) for n in v if n] for r, v in L.items() if isinstance(v, list)}


def match(x, names):
    if (x.get('ut') or '') != '아파트' and not x.get('utGuess'):
        # 용도가 확정됐는데 아파트가 아니면 이름이 같아도 상가·오피스텔이다.
        if x.get('ut'):
            return None
    reg = x.get('r')
    cands = names.get(reg) or []
    blob = _sq(' '.join(str(v) for v in (
        (x.get('br') or {}).get('bld'), (x.get('tx') or {}).get('nm'),
        (x.get('mk') or {}).get('nm'), x.get('a')) if v))
    if not blob:
        return None
    # 상가동·근생·주차장 호실은 아파트 단지 안이라도 대장 물건이 아니다.
    if re.search(r'상가|근생|근린|주차|점포', blob):
        return None
    for sq, raw in cands:
        if ' ' in raw.strip():
            # '정자동 파크뷰' 처럼 띄어 쓴 이름은 토막이 전부 들어 있어야 맞는다.
            # '파크뷰' 하나로는 광교상떼빌파크뷰·율하리버파크뷰까지 대장이 된다.
            if all(_sq(t) in blob for t in raw.split()):
                return raw
            continue
        if sq and sq in blob:
            return raw
    return None


def main():
    a = argparse.ArgumentParser()
    a.add_argument('--dry', action='store_true')
    a = a.parse_args()
    names = load_names()
    dp = ROOT / 'data' / 'data.json'
    D = json.loads(dp.read_text(encoding='utf-8'))
    st = Counter()
    for x in D:
        x.pop('lm', None)
        hit = match(x, names)
        if hit:
            x['lm'] = hit
            st[x.get('r')] += 1
            if x.get('st') == '진행중':
                st[f'{x.get("r")} 진행중'] += 1
    print('대장 단지 ' + ' · '.join(f'{k} {v}' for k, v in sorted(st.items())))
    if not a.dry:
        dp.write_text(json.dumps(D, ensure_ascii=False), encoding='utf-8')
        print(f'저장 {dp.name}')


if __name__ == '__main__':
    main()
