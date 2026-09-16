#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""우리 블로그에 실제로 올라간 글을 대시보드 blogPosts 와 대조한다.

제목만으로는 매칭이 안 된다 — 게시할 때 제목을 다시 쓰는 경우가 많아
대시보드 제목과 실제 게시 제목이 다르다. 대신 권리분석(물건 분석) 글에는
사건번호가 거의 항상 들어가므로, 사건번호를 1순위 키로 쓴다.

두 가지를 낸다:
  1) verify  — 대시보드에 있는데 주소가 비어 있던 글 -> 발행완료 + 주소 채우기
  2) backfill — 블로그에는 있는데 대시보드에 아예 없는 글 -> blogPosts 에 새로 등록
     (2026-09-14 에 이 구멍으로 권리분석 글 13건이 몇 주째 집계에서 빠져 있던 걸 찾았다)

사용법:
  python3 blog_publish_match.py snapshot.json naver_results.json verify_chunk.json [backfill_chunk.json]

naver_results.json 형식 (blog_rss_fetch.py 출력 = search_blog 결과와 같은 모양):
  [{"title":..., "description":..., "link":..., "postdate":"20260824",
    "bloggerlink":"https://blog.naver.com/ykphone_edu"}, ...]
"""
import json
import re
import sys

# 우리 블로그. 이 셋에 올라온 글만 '발행완료'로 채택한다.
# 주소 형태가 여러 가지라(blog / m.blog / PostList.naver?blogId=) 전체 URL 이 아니라
# 블로그 아이디만 뽑아서 비교한다.
OUR_BLOG_IDS = {
    "ykphone_edu",   # 공식블로그 — 권리분석 물건 분석글을 올리는 곳
    "hjko0",         # 대표님 블로그 — 학원 모집·정보성 글
    "gkgk0307_",
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


BLOG_ID_RE = re.compile(
    r"(?:m\.)?blog\.naver\.com/(?:PostList\.naver\?blogId=)?([A-Za-z0-9_-]+)")


def blog_id(link):
    m = BLOG_ID_RE.search(link or "")
    return m.group(1) if m else ""


def is_ours(link):
    return blog_id(link) in OUR_BLOG_IDS



# ── 제목 유사도 ────────────────────────────────────────────────
# 글자 순서 유사도(SequenceMatcher)와 낱말 겹침 비율 중 큰 쪽을 쓴다. 대리님이 제목을
# 다시 써도 핵심 낱말(단지명·수치·주제어)은 대개 남기 때문이다. 0.6 미만은 남으로 본다.
import difflib

def load_snapshot(path):
    """스냅샷 파일을 읽는다. 2026-09-16 부터 대시보드가 gzip(.json.gz) 으로 올리므로
    이름과 상관없이 첫 두 바이트(1f 8b)로 판단해 풀어서 읽는다. 평문 JSON 도 그대로 읽힌다."""
    import gzip
    raw = open(path, "rb").read()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return json.loads(raw.decode("utf-8"))

TITLE_MIN = 0.6

def _norm_title(t):
    return re.sub(r"[^0-9a-z가-힣]", "", (t or "").lower())

def _title_tokens(t):
    return {w for w in re.split(r"[^0-9a-zA-Z가-힣]+", t or "") if len(w) >= 2}

def title_score(a, b):
    na, nb = _norm_title(a), _norm_title(b)
    if not na or not nb:
        return 0.0
    seq = difflib.SequenceMatcher(None, na, nb).ratio()
    ta, tb = _title_tokens(a), _title_tokens(b)
    tok = len(ta & tb) / max(1, len(ta))
    return max(seq, tok)

def title_match(post, ours):
    """유일한 후보면 그 RSS 행을, 둘 이상이면 'ambiguous', 없으면 None."""
    created = str(post.get("createdAt") or post.get("date") or "")[:10].replace("-", "")
    cands = []
    for r in ours:
        sc = title_score(post.get("title"), r.get("title"))
        if sc < TITLE_MIN:
            continue
        # 글이 만들어지기 사흘 전보다 앞서 게시된 건 다른 글이다
        pd = str(r.get("postdate") or "")
        if created and pd and pd < _days_before(created, 3):
            continue
        cands.append((sc, r))
    if not cands:
        return None
    cands.sort(key=lambda x: -x[0])
    if len(cands) > 1 and cands[1][0] >= TITLE_MIN:
        return "ambiguous"
    return cands[0][1]

def _days_before(ymd, n):
    import datetime
    try:
        d = datetime.date(int(ymd[:4]), int(ymd[4:6]), int(ymd[6:8])) - datetime.timedelta(days=n)
        return d.strftime("%Y%m%d")
    except Exception:
        return "00000000"

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
    dedupe_ops = []   # 제목으로 맞춘 글과 겹치는 backfill 사본 삭제
    ours = [r for r in results if is_ours(r.get("bloggerlink"))]
    for p in posts:
        if (p.get("url") or "").strip():
            continue  # 이미 주소가 채워진 글은 건드리지 않는다
        pc = cases_in(p.get("title"), p.get("memo"), p.get("body"))
        if not pc:
            # 사건번호가 없는 정보성 글(파이프라인 글). 대리님이 제목을 고쳐 올리는 일이 많아
            # 제목 유사도로 맞춘다 — 대표님 블로그(hjko0)에 올린 파이프라인 글이 영영 발행대기로
            # 남던 구멍. 후보가 둘 이상이면 자동 채택하지 않는다.
            hit = title_match(p, ours)
            if hit == "ambiguous":
                ambiguous.append((p, [r for r in ours if title_score(p.get("title"), r.get("title")) >= TITLE_MIN]))
            elif hit:
                d = str(hit.get("postdate") or "")
                verify.append({"id": p["id"], "status": "발행완료", "url": hit.get("link", ""),
                               "publishedAt": f"{d[:4]}-{d[4:6]}-{d[6:8]}" if len(d) == 8 else ""})
                already.append((p, hit, ["제목유사"]))
                # 같은 주소가 RSS backfill 로 이미 따로 등록돼 있으면 그 사본은 지운다(글 하나가 둘로 세어지지 않게)
                link = (hit.get("link") or "").split("?")[0]
                for q in posts:
                    if q is not p and (q.get("url") or "").split("?")[0] == link and str(q.get("id", "")).startswith("blogrss-"):
                        dedupe_ops.append({"op": "delete", "list": "blogPosts", "match": {"id": q["id"]}})
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

    # 블로그에는 있는데 대시보드에 아예 없는 글. 주소로 한 번, 사건번호로 한 번 거른다.
    known_urls = {(p.get("url") or "").split("?")[0] for p in posts if p.get("url")}
    known_cases = set()
    for p in posts:
        known_cases |= cases_in(p.get("title"), p.get("memo"), p.get("body"))
    matched_urls = {v["url"].split("?")[0] for v in verify if v.get("url")}
    backfill, seen = [], set()
    for r in results:
        link = (r.get("link") or "").split("?")[0]
        if not link or not is_ours(r.get("bloggerlink")) or link in seen:
            continue
        if link in known_urls or link in matched_urls:
            continue
        rc = cases_in(r.get("title"), r.get("description"))
        if rc & known_cases:
            continue  # 같은 물건 글이 이미 대시보드에 있다 — 사람이 확인할 일이지 새로 만들 일이 아니다
        seen.add(link)
        backfill.append({
            "link": link,
            "title": r.get("title", ""),
            "postdate": str(r.get("postdate") or ""),
            "blogId": blog_id(r.get("bloggerlink")),
            # 여러 개면 가장 긴 것을 쓴다. 사전순으로 고르면 잘린 조각('2025타경11')이
            # 온전한 번호('2025타경1154')보다 앞서서 뽑힌다.
            "case": max(rc, key=len) if rc else "",
        })
    backfill.sort(key=lambda x: x["postdate"], reverse=True)
    match.dedupe_ops = dedupe_ops
    return verify, ambiguous, already, backfill


def backfill_ops(rows, now_iso):
    """backfill 행을 ahj_patch_chunk_ 형식(blogPosts upsert)으로 바꾼다."""
    ops = []
    for r in rows:
        d = r["postdate"]
        date = f"{d[:4]}-{d[4:6]}-{d[6:8]}" if len(d) == 8 else ""
        ops.append({
            "op": "set", "list": "blogPosts", "match": {"url": r["link"]}, "upsert": True,
            "fields": {
                "id": "blogrss-" + r["link"].rsplit("/", 1)[-1],
                "date": date, "publishedAt": date, "createdAt": now_iso,
                "title": r["title"], "status": "발행완료", "url": r["link"],
                "owner": r["blogId"], "caseNumber": r["case"],
                "topic": "경매 권리분석" if r["case"] else "블로그",
                "body": "",
                "memo": "블로그 RSS 에서 실제 게시일을 확인해 자동 등록. 파이프라인 밖에서 직접 쓴 글이라 "
                        "대시보드 집계에 없던 것이다. 본문은 대시보드에 없고 원문 링크로 대체한다.",
                "stageLog": [{"stage": "발행완료", "by": "안효준 대리", "at": date,
                              "note": "네이버 직접 게시 · RSS 확인으로 자동 등록"}],
            }})
    return ops


if __name__ == "__main__":
    import datetime
    snap_path, res_path, out_path = sys.argv[1:4]
    bf_path = sys.argv[4] if len(sys.argv) > 4 else None
    snap = load_snapshot(snap_path)
    results = json.load(open(res_path, encoding="utf-8"))
    verify, ambiguous, matched, backfill = match(snap, results)
    json.dump(verify, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if bf_path:
        # 제목으로 맞춘 글과 겹치는 backfill 사본 삭제도 같은 패치 파일에 넣는다 (형식이 같다)
        json.dump(backfill_ops(backfill, now_iso) + list(getattr(match, "dedupe_ops", [])), open(bf_path, "w", encoding="utf-8"),
                  ensure_ascii=False)
    print(f"matched {len(verify)} | ambiguous {len(ambiguous)} | 대시보드에 없는 글 {len(backfill)}")
    for r in backfill:
        print(f"  NEW {r['postdate']} [{r['blogId']}] {r['title'][:40]}")
    for p, r, cs in matched:
        print(f"  OK  {cs[0]} | {p['status']:5s} | {p['title'][:32]}")
        print(f"        -> {r.get('link')} ({r.get('postdate')})")
    for p, hits in ambiguous:
        print(f"  ??  {p['title'][:32]} — 후보 {len(hits)}개, 사람이 확인 필요")
