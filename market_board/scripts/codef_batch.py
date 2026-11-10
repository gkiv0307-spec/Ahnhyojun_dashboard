#!/usr/bin/env python3
"""codef-queue.json 을 위에서부터 훑어 CODEF 응답을 /tmp/na/raw 에 받아둔다.

  scripts/codef_batch.py [--limit 100] [--out /tmp/na/raw]

한도(하루 100건)는 datagokr.sh 의 codef_auction 이 스스로 센다. 여기서는
그 종료코드를 보고 멈춘다 — 한도 계산을 두 곳에 두면 반드시 어긋난다.

**같은 사건의 물건번호는 한 번만 부른다.** CODEF 는 사건 단위로 답하고
물건 목록을 통째로 준다. 물건번호마다 부르면 한도를 몇 배로 태운다.
"""
import argparse, json, os, pathlib, subprocess, sys, time

# datagokr.sh 의 종료코드. 4 = 일일 한도, 3 = 주간 예산, 2 = 검증 미완료.
# 1 은 그 밖의 실패인데 curl 실패도 여기로 온다 — 그래서 망 오류로 본다.
_RC_DAILY, _RC_NET = 4, 1
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SH = ROOT / 'scripts' / 'datagokr.sh'


def call(court, year, num):
    r = subprocess.run(
        ['bash', '-c', f'set +u; source "{SH}"; codef_auction "{court}" "{year}" "{num}"'],
        capture_output=True, text=True, timeout=180)
    return r.returncode, r.stdout, r.stderr


_DONE = {'종료', '취하', '기각', '각하', '배당종결', '취소'}


def _done_cases():
    """보드에서 '물건 전부가 대조 완료이고 종료' 인 사건 집합."""
    by = {}
    for fn in ('data.json', 'cars.json'):
        fp = ROOT / 'data' / fn
        if not fp.exists():
            continue
        for x in json.loads(fp.read_text(encoding='utf-8')):
            if not x.get('caNo'):
                continue
            k = (x.get('ct'), x['caNo'])
            by.setdefault(k, []).append(bool(x.get('verified')) and x.get('st') in _DONE)
    return {k for k, v in by.items() if v and all(v)}


def main():
    a = argparse.ArgumentParser()
    a.add_argument('--limit', type=int, default=100)
    a.add_argument('--out', default='/tmp/na/raw')
    a = a.parse_args()

    qp = ROOT / 'codef-queue.json'
    Q = json.loads(qp.read_text(encoding='utf-8'))
    out = pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    # 큐는 하루 한 번 굽는데, 그 뒤에 손으로 배치를 한 번 더 돌리면 큐가
    # 낡는다. 2026-09-07 에 그렇게 이미 대조를 마친 종료 사건 17건을 다시
    # 불러 한도를 태웠다. 그래서 부르기 직전에 보드를 한 번 더 본다 —
    # 그 사건의 물건이 전부 대조 완료 + 종료면 부르지 않는다.
    done = _done_cases()
    seen, jobs = set(), []
    st = Counter()
    for it in Q.get('items') or []:
        k = (it['court'], it['caNo'])
        if k in seen:
            continue
        seen.add(k)
        if k in done:
            st['이미 종료(큐 낡음)'] += 1
            continue
        jobs.append(it)
    if st:
        print(f"  큐가 낡음 — 이미 대조·종료된 사건 {st['이미 종료(큐 낡음)']}건 건너뜀. "
              "scripts/build_queue.py --write 로 다시 구워라.", file=sys.stderr)

    # --limit 은 실제 호출 수다. 이미 받아 둔 사건(파일 있음)을 슬라이스에
    # 넣으면 한도가 남는데도 뒤쪽 사건을 못 부른다 — 2026-09-16 에 그렇게
    # 51건만 부르고 62건을 남긴 채 끝났다.
    calls = 0
    for it in jobs:
        if calls >= a.limit:
            break
        court, caNo = it['court'], it['caNo']
        year, _, num = caNo.partition('타경')
        dst = out / f'{court}_{caNo}.json'
        if dst.exists():
            st['이미 받음'] += 1
            continue
        calls += 1
        rc, sout, serr = call(court, year, num)
        # 망 오류로 한 건이 죽었다고 그날 배치를 통째로 접지 마라.
        # 2026-09-05 에 'curl: (35) Recv failure' 한 번에 20건짜리 배치가
        # 0건 처리로 끝났고, 손으로 같은 사건을 다시 부르니 바로 됐다.
        # 한 번만 다시 걸고, 그래도 안 되면 그 사건만 건너뛴다.
        if rc == _RC_NET:
            print(f'  {court} {caNo}  망 오류 — 5초 뒤 한 번 더', file=sys.stderr)
            time.sleep(5)
            rc, sout, serr = call(court, year, num)
        if rc != 0 or not sout.strip():
            tail = (serr or '').strip().splitlines()
            msg = tail[0] if tail else ''
            # 4 = 일일 한도. 더 돌려봐야 한도 초과 응답만 쌓인다.
            if rc == _RC_DAILY:
                print(f'  {court} {caNo}  일일 한도 — 중단', file=sys.stderr)
                st['한도로 중단'] += 1
                break
            print(f'  {court} {caNo}  건너뜀(rc={rc}) {msg}', file=sys.stderr)
            st['건너뜀'] += 1
            continue
        dst.write_text(sout, encoding='utf-8')
        try:
            code = (json.loads(sout).get('result') or {}).get('code', '')
        except Exception:
            code = 'PARSE_FAIL'
        st[code or '빈코드'] += 1
        print(f'  {court} {caNo}  {code}', file=sys.stderr)
        # CF-00012 = 서버가 센 일일 한도 초과. 우리 카운터와 서버 카운터는
        # 어긋날 수 있고(오늘 실제로 그랬다), 이 응답도 호출 1건으로 나간다.
        # 멈추지 않으면 100건을 통째로 한도초과 응답으로 태운다.
        if code == 'CF-00012':
            dst.unlink(missing_ok=True)
            print('  일일 한도 초과 — 중단', file=sys.stderr)
            st['한도 초과로 중단'] += 1
            break

    print('\n' + ' · '.join(f'{k} {v}' for k, v in st.most_common()), file=sys.stderr)
    print(f'사건 {len(jobs)}건 중 {sum(v for k, v in st.items() if k != "중단")}건 처리 → {out}',
          file=sys.stderr)


if __name__ == '__main__':
    main()
