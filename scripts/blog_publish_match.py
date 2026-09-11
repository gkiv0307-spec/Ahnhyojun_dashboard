#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""네이버 블로그 검색 결과를 대시보드 blogPosts 와 대조해 '발행완료' 청크를 만든다.

제목만으로는 매칭이 안 된다 — 대리님이 게시할 때 제목을 다시 쓰는 경우가 많아
대시보드 제목과 실제 게시 제목이 다르다. 대신 권리분석(물건 분석) 글에는
사건번호가 거의 항상 들어가므로, 사건번호를 1순위 키로 쓴다.

사용법:
  python3 blog_publish_match.py snapshot.json naver_results.json verify_chunk.json

naver_results.json 형식 (search_blog 결과를 그대로 모아 둔 배열):
  [{"title":..., "description":..., "link":..., "postdate":"20260824",
    "bloggerlink":"https://blog.naver.com/ykphone_edu"}, ...]
"""
import json
import re
import sys

# 우리 블로그. 이 셋에 올라온 글만 '발행완료'로 채택한다.
OUR_BLOGS = {
    "https://blog.naver.com/ykphone_edu",   # 공식블로그 — 권리분석 물건 분석글
    "https://blog.naver.com/hjko0",         # 대표님 블로그 — 학원·정보성 글
    "https://blog.naver.com/rhghwjd12",
}

CASE_RE = re.compile(r"20\d\d\s*타\s*경\s*\d+")
TAG_RE = re.compile(r"<[^>]+>")


def norm_case(x):
    """'2026 타경 100305', '<b>2026타경100305</b>' 를 '2026타경100305' 로 맞춘다."""
    return re.sub(r"\s+", "", TAG_RE.sub("", x))


def cases_in(*texts):
    out = set()
    for t in texts:
        if not t:
            continue
        for m in CASE_RE.findall(TAG_RE.sub("", t)):
            out.add(norm_case(m))
    return out


def is_ours(link):
    link = (link or "").rstrip("/").replace("//m.blog.naver.com", "//blog.naver.com")
    return link in OUR_BLOGS


def match(snapshot, results):
    posts = snapshot.get("blogPosts", [])
    # 사건번호 -> 우리 블로그 글
    by_case = {}
    for r in results:
        if not is_ours(r.get("bloggerlink")):
            continue
        for c in cases_in(r.get("title"), r.get("description")):
            by_case.setdefault(c, []).append(r)

    verify, ambiguous, already = [], [], []
    for p in posts:
        if (p.get("url") or "").strip():
            continue  # 이미 주소가 채워진 글은 건드리지 않는다
        pc = cases_in(p.get("title"), p.get("memo"), p.get("body"))
        if not pc:
            continue
        hits = []
        for c in pc:
            for r in by_case.get(c, []):
                if r not in hits:
                    hits.append(r)
        if not hits:
            continue
        if len(hits) > 1:
            # 같은 사건번호로 우리 블로그 글이 여러 개면 사람이 골라야 한다
            ambiguous.append((p, hits))
            continue
        r = hits[0]
        d = str(r.get("postdate") or "")
        verify.append({
            "id": p["id"],
            "status": "발행완료",
            "url": r.get("link", ""),
            "publishedAt": f"{d[:4]}-{d[4:6]}-{d[6:8]}" if len(d) == 8 else "",
        })
        already.append((p, r, sorted(pc)))
    return verify, ambiguous, already


if __name__ == "__main__":
    snap_path, res_path, out_path = sys.argv[1:4]
    snap = json.load(open(snap_path, encoding="utf-8"))
    results = json.load(open(res_path, encoding="utf-8"))
    verify, ambiguous, matched = match(snap, results)
    json.dump(verify, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"matched {len(verify)} | ambiguous {len(ambiguous)}")
    for p, r, cs in matched:
        print(f"  OK  {cs[0]} | {p['status']:5s} | {p['title'][:32]}")
        print(f"        -> {r.get('link')} ({r.get('postdate')})")
    for p, hits in ambiguous:
        print(f"  ??  {p['title'][:32]} — 후보 {len(hits)}개, 사람이 확인 필요")
