#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""우리 블로그 3곳의 RSS 를 받아 blog_publish_match.py 가 먹는 형식으로 만든다.

왜 RSS 인가:
  네이버 검색 API 는 '검색어'로만 찾는다. 특정 블로그의 글 목록을 통째로 가져올
  방법이 없어서, 본문에 브랜드명이 없는 글은 아무리 검색해도 안 걸렸다.
  실제로 9/7~9/11 에 공식블로그에 올린 권리분석 글 13건이 몇 주째 집계에서 빠져 있었고
  (2026-09-14 확인), 아침 발행 확인 루틴은 매일 "매칭 0건"을 보고하고 있었다.
  RSS 는 그 블로그의 최근 글을 날짜까지 정확히, 검색어 없이 전부 준다.

  한계: 네이버 블로그 RSS 는 최근 50건까지만 준다. 그보다 오래된 글은 안 나온다.
  (하루 2~3건 올리는 지금 속도면 2~3주치라 아침 루틴 용도로는 충분하다.)

사용법:
  python3 blog_rss_fetch.py naver_results.json
  python3 blog_rss_fetch.py naver_results.json ykphone_edu hjko0   # 일부만

출력: [{"title","description","link","bloggerlink","postdate"}] — search_blog 결과와 같은 모양.
"""
import email.utils
import json
import re
import subprocess
import sys
import urllib.request

OUR_BLOGS = ["ykphone_edu", "hjko0", "gkgk0307_"]
# rhghwjd00 은 공식블로그(ykphone_edu)의 네이버 계정 id 다(2026-09-17 확인). RSS 는 계정 id 로는 403 이 나고
# 블로그 주소 id(ykphone_edu)로만 열린다. 글 링크도 ykphone_edu 로 나오므로 목록엔 넣지 않는다.
FEED = "https://rss.blog.naver.com/{}.xml"
# RSS 는 최근 50건까지만 준다. 모바일 블로그 API 는 페이지를 넘기면 전체 글이 나와서(계정 id 로도 됨)
# 같이 받아 링크 기준으로 합친다. 실패해도 RSS 결과만으로 진행한다.
MOBILE_API = "https://m.blog.naver.com/api/blogs/{}/post-list?categoryNo=0&itemCount=30&page={}"
MOBILE_PAGES = 4
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
UA = "Mozilla/5.0 (compatible; ahj-dashboard/1.0)"

ITEM_RE = re.compile(r"<item>(.*?)</item>", re.S)
TAG_RE = re.compile(r"<[^>]+>")

# 본문 대조 (2026-09-30 대리님 지시): 대표님이 공식블로그에 올리는 물건 글은 제목·요약에 사건번호가 없고
# 본문에만 있는 경우가 많다(9/29 물건 글 10건 중 8건). 그러면 사건번호로 맞추는 권리분석 체크·backfill 이
# 그 글을 못 본다. 최근 BODY_DAYS 일 안의 글 가운데 제목·요약에 사건번호가 없는 것은 글 페이지를 직접 열어
# 본문에서 사건번호를 뽑아 description 끝에 "[본문 사건번호: …]" 로 덧붙인다. 실패해도 그냥 넘어간다.
BODY_DAYS = 14
BODY_MAX_FETCH = 40
BODY_BLOGS = ["ykphone_edu", "hjko0"]
CASE_RE = re.compile(r"20\d\d\s*타\s*경\s*\d{1,6}")
POST_VIEW = "https://m.blog.naver.com/PostView.naver?blogId={}&logNo={}"
POST_VIEW_PC = "https://blog.naver.com/PostView.naver?blogId={}&logNo={}"
MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"


DESC_LIMIT = 600
TAIL_CASE_RE = re.compile(r"20\d\d\s*타\s*경\s*\d*$")


def _clip(text, limit=DESC_LIMIT):
    """요약을 자르되, 끝에 반쪽짜리 사건번호가 남지 않게 한다."""
    if len(text) <= limit:
        return text
    return TAIL_CASE_RE.sub("", text[:limit]).rstrip()


def _field(block, name):
    m = re.search(r"<%s>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</%s>" % (name, name), block, re.S)
    return m.group(1).strip() if m else ""


def fetch(url, timeout=25):
    """urllib 로 먼저 받고, 막히면 curl 로 한 번 더 시도한다(프록시 환경 차이 대비)."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", "replace")
    except Exception:
        out = subprocess.run(
            ["curl", "-sS", "--max-time", str(timeout), "-H", "User-Agent: " + UA, url],
            capture_output=True, text=True)
        if out.returncode != 0 or not out.stdout.strip():
            raise
        return out.stdout


def parse(xml, blog_id):
    rows = []
    for block in ITEM_RE.findall(xml):
        title = _field(block, "title")
        link = _field(block, "link").split("?")[0]
        pub = _field(block, "pubDate")
        if not (title and link and pub):
            continue
        try:
            # pubDate 는 KST(+0900)로 온다. 날짜만 쓰므로 그대로 쓴다.
            dt = email.utils.parsedate_to_datetime(pub)
            postdate = dt.strftime("%Y%m%d")
        except Exception:
            postdate = ""
        rows.append({
            "title": title,
            # 본문 요약에도 사건번호가 들어 있는 경우가 있어 태그만 벗겨 같이 넘긴다.
            # 자를 때 사건번호 한가운데가 끊기면 '2025타경1154' 가 '2025타경11' 이 되어
            # 엉뚱한 번호로 등록된다(실제로 그랬다). 끝에 걸린 조각은 떼어낸다.
            "description": _clip(TAG_RE.sub(" ", _field(block, "description"))),
            "link": link,
            "bloggerlink": "https://blog.naver.com/" + blog_id,
            "postdate": postdate,
        })
    return rows


def fetch_mobile(blog_id, pages=MOBILE_PAGES, timeout=25):
    """모바일 블로그 API 로 글 목록을 받는다(RSS 50건 한계 보완). 링크의 블로그 id 는 응답의 domainIdOrBlogId 를 쓴다."""
    import json as _json
    import datetime as _dt
    rows = []
    for page in range(1, pages + 1):
        url = MOBILE_API.format(blog_id, page)
        req = urllib.request.Request(url, headers={"User-Agent": BROWSER_UA, "Referer": "https://m.blog.naver.com/" + blog_id})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = _json.loads(r.read().decode("utf-8", "replace"))
        except Exception:
            try:
                out = subprocess.run(["curl", "-sS", "--max-time", str(timeout), "-A", BROWSER_UA,
                                      "-H", "Referer: https://m.blog.naver.com/" + blog_id, url], capture_output=True, text=True)
                data = _json.loads(out.stdout)
            except Exception:
                break
        items = ((data or {}).get("result") or {}).get("items") or []
        if not items:
            break
        for x in items:
            bid = x.get("domainIdOrBlogId") or blog_id
            try:
                postdate = _dt.datetime.utcfromtimestamp(int(x.get("addDate")) / 1000 + 9 * 3600).strftime("%Y%m%d")
            except Exception:
                postdate = ""
            rows.append({
                "title": (x.get("titleWithInspectMessage") or x.get("title") or "").strip(),
                "description": _clip(TAG_RE.sub(" ", x.get("briefContents") or "")),
                "link": "https://blog.naver.com/%s/%s" % (bid, x.get("logNo")),
                "bloggerlink": "https://blog.naver.com/" + bid,
                "postdate": postdate,
            })
        if len(items) < 30:
            break
    return rows


def _cases(text):
    return sorted({re.sub(r"\s", "", c) for c in CASE_RE.findall(text or "")})


def fetch_body_cases(blog_id, logno, timeout=25):
    """글 페이지를 열어 본문의 사건번호 목록을 돌려준다. 모바일 → PC 순서로 시도하고 못 열면 빈 목록."""
    import html as _html
    for url, ua in ((POST_VIEW.format(blog_id, logno), MOBILE_UA), (POST_VIEW_PC.format(blog_id, logno), BROWSER_UA)):
        req = urllib.request.Request(url, headers={"User-Agent": ua, "Referer": "https://m.blog.naver.com/" + blog_id})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                page = r.read().decode("utf-8", "replace")
        except Exception:
            try:
                out = subprocess.run(["curl", "-sS", "--max-time", str(timeout), "-A", ua,
                                      "-H", "Referer: https://m.blog.naver.com/" + blog_id, url], capture_output=True, text=True)
                page = out.stdout if out.returncode == 0 else ""
            except Exception:
                page = ""
        if not page:
            continue
        found = _cases(_html.unescape(TAG_RE.sub(" ", page)))
        if found:
            return found
    return []


def scan_bodies(rows, days=BODY_DAYS, max_fetch=BODY_MAX_FETCH):
    """최근 글 중 제목·요약에 사건번호가 없는 것만 본문을 열어 사건번호를 덧붙인다."""
    import datetime as _dt
    import time as _time
    since = (_dt.datetime.utcnow() + _dt.timedelta(hours=9) - _dt.timedelta(days=days)).strftime("%Y%m%d")
    targets = []
    for r in rows:
        m = re.search(r"blog\.naver\.com/([^/]+)/(\d+)$", r.get("link") or "")
        if not m or m.group(1) not in BODY_BLOGS:
            continue
        if (r.get("postdate") or "") < since:
            continue
        if _cases((r.get("title") or "") + " " + (r.get("description") or "")):
            continue
        targets.append((r, m.group(1), m.group(2)))
    targets.sort(key=lambda t: t[0].get("postdate") or "", reverse=True)
    hit = 0
    for r, bid, logno in targets[:max_fetch]:
        found = fetch_body_cases(bid, logno)
        if found:
            r["description"] = ((r.get("description") or "").rstrip() + " [본문 사건번호: " + " ".join(found) + "]").strip()
            r["bodyCases"] = found
            hit += 1
        _time.sleep(0.3)
    print(f"  본문 대조: 최근 {days}일 사건번호 없는 글 {len(targets)}건 중 {min(len(targets), max_fetch)}건 열어 {hit}건에서 사건번호 찾음")
    return hit


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "naver_results.json"
    blogs = sys.argv[2:] or OUR_BLOGS
    all_rows, failed = [], []
    for b in blogs:
        rows = []
        try:
            rows = parse(fetch(FEED.format(b)), b)
            newest = max((r["postdate"] for r in rows), default="-")
            print(f"  {b}: RSS {len(rows)}건 (최신 {newest})")
        except Exception as e:
            print(f"  {b}: RSS 실패 — {e}")
        # 모바일 API 로 50건 너머까지 보완. RSS 가 죽어도 이게 되면 그 블로그는 성공으로 친다.
        try:
            extra = fetch_mobile(b)
            have = {r["link"] for r in rows}
            added = [r for r in extra if r["link"] not in have]
            rows.extend(added)
            if extra:
                print(f"  {b}: 모바일 목록 {len(extra)}건 (RSS 에 없던 {len(added)}건 추가)")
        except Exception as e:
            print(f"  {b}: 모바일 목록 실패 — {e}")
        if rows:
            all_rows.extend(rows)
        else:
            failed.append(b)
    all_rows.sort(key=lambda r: r["postdate"], reverse=True)
    try:
        scan_bodies(all_rows)
    except Exception as e:
        print(f"  본문 대조 실패 — {e}")
    json.dump(all_rows, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"총 {len(all_rows)}건 -> {out_path}" + (f" (실패: {', '.join(failed)})" if failed else ""))
    # 전부 실패했으면 루틴이 그대로 넘어가지 않도록 오류로 끝낸다.
    return 1 if len(failed) == len(blogs) else 0


if __name__ == "__main__":
    sys.exit(main())
