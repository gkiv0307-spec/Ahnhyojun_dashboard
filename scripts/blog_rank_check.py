#!/usr/bin/env python3
"""블로그 글의 네이버 블로그 검색 순위 확인 (NAVER API HUB 블로그 검색, 유사도순 100건).

2026-06 부터 네이버 검색 API 는 개발자센터(openapi.naver.com)가 아니라 네이버 클라우드 NAVER API HUB 로 옮겨졌다.
엔드포인트 https://naverapihub.apigw.ntruss.com/search/v1/blog, 헤더 X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY.
환경 변수 NAVER_APIHUB_KEY_ID / NAVER_APIHUB_KEY 를 우선 쓰고, 없으면 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 를 같은 뜻으로 읽는다.
(개발자센터 옛 키가 있으면 NAVER_LEGACY=1 로 openapi.naver.com 호출.)

사용법:
  python3 blog_rank_check.py snapshot.json out_patch.json            # 스냅샷에서 대상 글을 뽑아 확인
  python3 blog_rank_check.py --targets targets.json out_patch.json   # 미리 뽑아 둔 대상 목록으로 확인

대상 = 발행완료 + 주소(logNo) 있음 + 게시일이 최근 60일 안, 최신순 최대 40건 (대시보드 blogRankTargets 와 같은 기준).
키워드 = mainKeyword 가 있으면 그것, 없으면 제목에서 자동 추출(대시보드 blogAutoKeyword 와 같은 규칙).
결과 = ahj_patch_chunk 형식 [{op:"set", list:"blogPosts", match:{id}, fields:{rank, rankPrev, rankPrevAt, rankCheckedAt, rankKeyword, rankHistory}}]
  - rank: 1~100, 100위 안에 없으면 null. rankPrev 는 전날 값(스냅샷의 rank)이 오늘 확인과 날짜가 다를 때만 민다.
"""
import sys, os, re, json, time, datetime, gzip, urllib.request, urllib.parse

WINDOW_DAYS = 60
MAX_AUTO = 40
DISPLAY = 100
GAP_SEC = 0.35
STOP = {"왜","반드시","정말","그런데","지금","이제","무엇","어떻게","하나","대비","그리고","그래서","이유","이유는","때","vs"}


def load_json(path):
    raw = open(path, "rb").read()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return json.loads(raw.decode("utf-8"))


def log_no(url):
    s = str(url or "")
    m = re.search(r"logNo=(\d{9,})", s) or re.search(r"blog\.naver\.com/[^/?#]+/(\d{9,})", s)
    return m.group(1) if m else ""


def auto_keyword(title):
    t = re.sub(r"20\d\d타경\d+", " ", str(title or ""))
    t = re.sub(r"[\[\]()|,:·…?!'\"“”‘’~\-–—]", " ", t)
    words = [w for w in t.split() if len(w) >= 2 and not re.search(r"\d", w) and w not in STOP]
    out = []
    for w in words:
        out.append(w)
        if w == "경매" and len(out) >= 3:
            break
        if len(out) >= 5:
            break
    return " ".join(out)


def published_date(p):
    for k in ("publishedAt", "date", "createdAt"):
        v = str(p.get(k) or "")[:10]
        if re.match(r"\d{4}-\d{2}-\d{2}$", v):
            return v
    return ""


def targets_from_snapshot(snap, today):
    out = []
    for p in snap.get("blogPosts", []):
        if p.get("status") != "발행완료" or not log_no(p.get("url")):
            continue
        d = published_date(p)
        if not d:
            continue
        days = (datetime.date.fromisoformat(today) - datetime.date.fromisoformat(d)).days
        if days < 0 or days > WINDOW_DAYS:
            continue
        kw = str(p.get("mainKeyword") or "").strip() or auto_keyword(p.get("title"))
        out.append({"date": d, "id": p["id"], "logNo": log_no(p["url"]), "kw": kw, "title": p.get("title") or "",
                    "rank": p.get("rank"), "rankCheckedAt": p.get("rankCheckedAt"), "rankPrev": p.get("rankPrev"),
                    "rankPrevAt": p.get("rankPrevAt"), "rankHistory": p.get("rankHistory") or []})
    out.sort(key=lambda x: x["date"], reverse=True)
    return out[:MAX_AUTO]


def search_rank(kw, logno, cid, secret):
    q = urllib.parse.urlencode({"query": kw, "display": DISPLAY, "sort": "sim"})
    if os.environ.get("NAVER_LEGACY"):
        url = "https://openapi.naver.com/v1/search/blog.json?" + q
        headers = {"X-Naver-Client-Id": cid, "X-Naver-Client-Secret": secret}
    else:
        url = "https://naverapihub.apigw.ntruss.com/search/v1/blog?" + q
        headers = {"X-NCP-APIGW-API-KEY-ID": cid, "X-NCP-APIGW-API-KEY": secret}
    headers["User-Agent"] = "ahj-dashboard/1.0"
    req = urllib.request.Request(url, headers=headers)
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read().decode("utf-8"))
            items = data.get("items") or []
            for i, it in enumerate(items):
                if log_no(it.get("link")) == logno:
                    return i + 1, len(items)
            return None, len(items)
        except Exception as e:  # 429·5xx·네트워크
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(str(last))


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__); sys.exit(2)
    cid = os.environ.get("NAVER_APIHUB_KEY_ID") or os.environ.get("NAVER_CLIENT_ID", "")
    secret = os.environ.get("NAVER_APIHUB_KEY") or os.environ.get("NAVER_CLIENT_SECRET", "")
    if not cid or not secret:
        print("NAVER_APIHUB_KEY_ID / NAVER_APIHUB_KEY (또는 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET) 환경 변수가 없습니다."); sys.exit(3)
    today = (datetime.datetime.utcnow() + datetime.timedelta(hours=9)).strftime("%Y-%m-%d")
    if args[0] == "--targets":
        targets = load_json(args[1]); out_path = args[2]
    else:
        targets = targets_from_snapshot(load_json(args[0]), today); out_path = args[1]
    print(f"대상 {len(targets)}건 (기준일 {today})")
    patches, ok, fail = [], 0, 0
    now = datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    for t in targets:
        try:
            rank, n = search_rank(t["kw"], t["logNo"], cid, secret)
        except Exception as e:
            fail += 1; print(f"  FAIL {t['id']} {t['kw']} :: {e}"); continue
        ok += 1
        prev, prev_at = t.get("rankPrev"), t.get("rankPrevAt")
        if t.get("rankCheckedAt") and t.get("rankCheckedAt") != today:
            prev, prev_at = t.get("rank"), t.get("rankCheckedAt")
        hist = [h for h in (t.get("rankHistory") or []) if isinstance(h, dict)][-29:]
        hist.append({"at": today, "rank": rank, "keyword": t["kw"], "by": "routine"})
        patches.append({"op": "set", "list": "blogPosts", "match": {"id": t["id"]},
                        "fields": {"rank": rank, "rankPrev": prev, "rankPrevAt": prev_at, "rankCheckedAt": today,
                                   "rankKeyword": t["kw"], "rankHistory": hist}})
        print(f"  {str(rank) if rank else '-':>3} | {t['kw']} | {t['title'][:30]} (검색 {n}건)")
        time.sleep(GAP_SEC)
    json.dump(patches, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"확인 {ok}건 · 실패 {fail}건 → {out_path} ({len(patches)} patches, {now})")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
