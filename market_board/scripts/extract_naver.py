#!/usr/bin/env python3
"""대화 기록(jsonl)에서 그날의 네이버 검색 결과를 제목<TAB>설명 TSV 로 뽑는다.

검색 결과는 도구 결과의 **문자열 값 안에 JSON 이 통째로 들어** 있다. 줄에서
정규식으로 중괄호를 세는 방식은 `{` 과 키 사이의 줄바꿈·공백에 걸려 0건이
나온다(2026-09-24 에 그랬다). jsonl 한 줄을 정상 JSON 으로 읽고, 모든 문자열
값을 훑어 lastBuildDate 가 든 것만 다시 json.loads 하는 쪽이 튼튼하다.

lastBuildDate 로 그날 것만 걸러야 한다 — 한 세션에 며칠치가 쌓여 있어서
날짜를 안 보면 어제 결과를 오늘 것으로 또 파싱한다.
사용법: scripts/extract_naver.py "24 Sep 2026" out.tsv   (lastBuildDate 는 KST 다)
"""
import glob, json, os, sys

day, out = sys.argv[1], sys.argv[2]
paths = sorted(glob.glob(os.path.expanduser('~/.claude/projects/*/*.jsonl')),
               key=os.path.getmtime, reverse=True)
rows, seen, blobs = [], set(), 0


def strings(o):
    if isinstance(o, str):
        yield o
    elif isinstance(o, dict):
        for v in o.values():
            yield from strings(v)
    elif isinstance(o, list):
        for v in o:
            yield from strings(v)


for p in paths:
    for line in open(p, encoding='utf-8', errors='replace'):
        if 'lastBuildDate' not in line:
            continue
        try:
            env = json.loads(line)
        except Exception:
            continue
        for s in strings(env):
            if '"lastBuildDate"' not in s:
                continue
            i = s.find('{')
            while i != -1:
                try:
                    o = json.loads(s[i:])
                except Exception:
                    # 뒤에 군더더기가 붙어 있으면 디코더로 앞부분만 읽는다
                    try:
                        o, _ = json.JSONDecoder().raw_decode(s[i:])
                    except Exception:
                        i = s.find('{', i + 1)
                        continue
                blobs += 1
                if day in str(o.get('lastBuildDate', '')):
                    for it in o.get('items') or []:
                        t = (it.get('title') or '').replace('\t', ' ').replace('\n', ' ')
                        d = (it.get('description') or '').replace('\t', ' ').replace('\n', ' ')
                        if t and (t, d) not in seen:
                            seen.add((t, d)); rows.append(f'{t}\t{d}')
                break
open(out, 'w', encoding='utf-8').write('\n'.join(rows) + '\n')
print(f'덩어리 {blobs} · {day} 행 {len(rows)}')
