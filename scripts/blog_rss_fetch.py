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
FEED = "https://rss.blog.naver.com/{}.xml"
UA = "Mozilla/5.0 (compatible; ahj-dashboard/1.0)"

ITEM_RE = re.compile(r"<item>(.*?)</item>", re.S)
TAG_RE = re.compile(r"<[^>]+>")


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


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "naver_results.json"
    blogs = sys.argv[2:] or OUR_BLOGS
    all_rows, failed = [], []
    for b in blogs:
        try:
            rows = parse(fetch(FEED.format(b)), b)
            all_rows.extend(rows)
            newest = max((r["postdate"] for r in rows), default="-")
            print(f"  {b}: {len(rows)}건 (최신 {newest})")
        except Exception as e:
            failed.append(b)
            print(f"  {b}: 실패 — {e}")
    all_rows.sort(key=lambda r: r["postdate"], reverse=True)
    json.dump(all_rows, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"총 {len(all_rows)}건 -> {out_path}" + (f" (실패: {', '.join(failed)})" if failed else ""))
    # 전부 실패했으면 루틴이 그대로 넘어가지 않도록 오류로 끝낸다.
    return 1 if len(failed) == len(blogs) else 0


if __name__ == "__main__":
    sys.exit(main())
