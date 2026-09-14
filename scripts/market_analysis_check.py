#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""블로그에 올라간 권리분석 글과 데일리 경매분석 물건을 사건번호로 맞춰
'권리분석 작성됨' 체크를 자동으로 켠다.

대리님이 권리분석 글을 쓰고 네이버에 올리면, 대시보드의 물건 카드에서
'권리분석 작성완료' 체크를 따로 눌러야 했다. 그 손이 빠지면 화면에는
계속 '권리분석 미작성'으로 남는다. 글이 이미 올라가 있으면 그게 곧 증거이므로
사건번호가 일치할 때 자동으로 켠다.

- 켜기만 한다. 이미 켜진 것을 끄지 않는다(사람이 끈 것을 되돌리면 안 된다).
- 사건번호가 정확히 같을 때만 켠다. 제목·단지명 비슷한 것으로는 켜지 않는다.
- 같은 사건번호로 우리 글이 여러 개면 가장 최근 글의 주소를 쓴다.

사용법:
  python3 market_analysis_check.py snapshot.json naver_results.json out_chunk.json
  (naver_results.json 은 blog_rss_fetch.py 출력)
"""
import json
import re
import sys

CASE_RE = re.compile(r"20\d\d\s*타\s*경\s*\d+")
TAG_RE = re.compile(r"<[^>]+>")
BLOG_ID_RE = re.compile(
    r"(?:m\.)?blog\.naver\.com/(?:PostList\.naver\?blogId=)?([A-Za-z0-9_-]+)")
OUR_BLOG_IDS = {"ykphone_edu", "hjko0", "gkgk0307_"}


def norm_case(x):
    return re.sub(r"\s+", "", TAG_RE.sub("", x))


def cases_in(*texts):
    out = set()
    for t in texts:
        if not t:
            continue
        for m in CASE_RE.findall(TAG_RE.sub("", str(t))):
            out.add(norm_case(m))
    return out


def is_ours(link):
    m = BLOG_ID_RE.search(link or "")
    return (m.group(1) if m else "") in OUR_BLOG_IDS


def build(snapshot, results):
    # 사건번호 -> 우리 블로그 글(가장 최근 것)
    by_case = {}
    for r in results:
        if not is_ours(r.get("bloggerlink")):
            continue
        for c in cases_in(r.get("title"), r.get("description")):
            cur = by_case.get(c)
            if not cur or str(r.get("postdate") or "") > str(cur.get("postdate") or ""):
                by_case[c] = r

    ops, hit, already, nopost = [], [], [], []
    for m in snapshot.get("marketAuctions", []):
        # caseNumber 에 '2025타경1245 물건1' 처럼 꼬리가 붙은 항목이 있다.
        # 통째로 비교하면 영영 안 맞으므로 사건번호만 뽑아 비교한다.
        # (patch 의 match 에는 원본 문자열을 그대로 써야 그 항목을 찾는다.)
        found = cases_in(m.get("caseNumber"))
        case = max(found, key=len) if found else ""
        if not case:
            continue
        post = by_case.get(case)
        if not post:
            if not m.get("analysisWritten"):
                nopost.append(m)
            continue
        if m.get("analysisWritten"):
            already.append((m, post))
            continue
        d = str(post.get("postdate") or "")
        date = f"{d[:4]}-{d[4:6]}-{d[6:8]}" if len(d) == 8 else ""
        ops.append({
            "op": "set", "list": "marketAuctions", "match": {"caseNumber": m["caseNumber"]},
            "fields": {
                "analysisWritten": True,
                "analysisUrl": post.get("link", ""),
                "analysisAt": date,
            }})
        hit.append((m, post, date))
    return ops, hit, already, nopost


if __name__ == "__main__":
    snap_path, res_path, out_path = sys.argv[1:4]
    snap = json.load(open(snap_path, encoding="utf-8"))
    results = json.load(open(res_path, encoding="utf-8"))
    ops, hit, already, nopost = build(snap, results)
    json.dump(ops, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"새로 체크 {len(hit)} | 이미 체크됨 {len(already)} | 글 없는 미작성 {len(nopost)}")
    for m, p, d in hit:
        print(f"  CHECK {m['caseNumber']} {m.get('buildingName', '')[:18]} <- {d} {p.get('link')}")
    for m in nopost:
        print(f"  none  {m['caseNumber']} {m.get('buildingName', '')[:18]} (블로그 글 없음)")
