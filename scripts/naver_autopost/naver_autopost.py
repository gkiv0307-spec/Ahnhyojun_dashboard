#!/usr/bin/env python3
"""대시보드 '발행대기' 글을 네이버 블로그에 올리는 PC용 반자동 스크립트 (2026-09-22, 대리님 결정).

동작 원리
- 비밀번호를 저장하지 않는다. 전용 크롬 프로필(naver_profile/)에 대리님이 한 번만 직접 로그인해 두면
  그 로그인 상태가 유지되고, 스크립트는 그 브라우저로 글쓰기 화면만 연다.
- 글은 Google Drive 데스크톱이 동기화해 둔 "안효준 대시보드 백업" 폴더의 최신 스냅샷에서 읽는다.
- 올린 뒤에는 같은 폴더에 ahj_blog_chunk_<날짜>-verify-autopost-<시각>.json 을 써 둔다.
  대시보드가 열릴 때 그 파일을 읽어 글을 '발행완료'로 바꾸고 주소를 채운다(KPI 집계).
- 한 번에 기본 1건, 오래된 글부터. 캡차·로그인 화면이 보이면 멈춘다(우회하지 않는다).
- 창을 띄운 채(headless 아님) 사람이 보는 앞에서 돈다. 네이버 화면이 바뀌면 선택자가 안 맞을 수 있으니
  처음엔 --dry-run 으로 확인한다.

명령
  python naver_autopost.py --login        전용 프로필로 크롬을 열어 준다. 직접 로그인하면 창이 닫힌다.
  python naver_autopost.py --list         올릴 수 있는 발행대기 글 목록
  python naver_autopost.py --dry-run      글쓰기 화면에 제목·본문까지 넣고 멈춘다(발행 안 함). 화면 확인용.
  python naver_autopost.py                발행대기 글 1건 발행 (--limit N 으로 개수, --id 글id 로 지정)
"""
import argparse
import base64
import glob
import gzip
import html
import json
import os
import random
import re
import sys
import time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "config.json")
STATE_PATH = os.path.join(HERE, "posted_state.json")
DEFAULT_CONFIG = {
    "blog_id": "ykphone_edu",
    "drive_backup_dir": "G:\\내 드라이브\\안효준 대시보드 백업",
    "profile_dir": os.path.join(HERE, "naver_profile"),
    "posts_per_run": 1,
    "type_delay_ms": [30, 90],
    "pause_between_posts_sec": [90, 180],
}


# ── 설정·상태 ────────────────────────────────────────────────────────────
def load_config():
    cfg = dict(DEFAULT_CONFIG)
    if os.path.exists(CONFIG_PATH):
        cfg.update(json.load(open(CONFIG_PATH, encoding="utf-8")))
    else:
        json.dump(cfg, open(CONFIG_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"[설정] {CONFIG_PATH} 를 만들었습니다. drive_backup_dir 경로를 확인하세요.")
    return cfg


def load_state():
    if os.path.exists(STATE_PATH):
        return json.load(open(STATE_PATH, encoding="utf-8"))
    return {"posted": {}}


def save_state(st):
    json.dump(st, open(STATE_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)


# ── 스냅샷 ───────────────────────────────────────────────────────────────
def load_snapshot_bytes(raw):
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    try:
        return json.loads(raw)
    except Exception:
        raw = base64.b64decode(raw)
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        return json.loads(raw)


def latest_snapshot(drive_dir):
    cands = []
    for name in ("ahj_dashboard_snapshot.json.gz", "ahj_dashboard_snapshot.json"):
        p = os.path.join(drive_dir, name)
        if os.path.exists(p):
            cands.append((os.path.getmtime(p), p))
    if not cands:
        raise SystemExit(f"[오류] {drive_dir} 에 ahj_dashboard_snapshot.json(.gz) 이 없습니다. "
                         "Google Drive 데스크톱 동기화 경로(config.json 의 drive_backup_dir)를 확인하세요.")
    cands.sort(reverse=True)
    mtime, path = cands[0]
    print(f"[스냅샷] {os.path.basename(path)} ({datetime.fromtimestamp(mtime):%Y-%m-%d %H:%M})")
    return load_snapshot_bytes(open(path, "rb").read()), mtime


def already_verified_ids(drive_dir, since_mtime):
    """스냅샷보다 나중에 생긴 -verify 청크에 든 글 id.
    대시보드가 아직 안 열려 스냅샷엔 발행대기로 남아 있어도 이미 올린 글이다."""
    ids = set()
    for p in glob.glob(os.path.join(drive_dir, "ahj_blog_chunk_*verify*.json")):
        if os.path.getmtime(p) < since_mtime:
            continue
        try:
            arr = json.load(open(p, encoding="utf-8"))
            for it in (arr if isinstance(arr, list) else arr.get("items", [])):
                if it.get("id"):
                    ids.add(it["id"])
        except Exception:
            pass
    return ids


def pending_posts(cfg, st, only_id=None):
    snap, mtime = latest_snapshot(cfg["drive_backup_dir"])
    done = set(st["posted"].keys()) | already_verified_ids(cfg["drive_backup_dir"], mtime)
    posts = [p for p in snap.get("blogPosts", [])
             if p.get("status") == "발행대기" and (p.get("body") or "").strip()]
    posts.sort(key=lambda p: (p.get("date") or "", p.get("createdAt") or ""))
    out = []
    for p in posts:
        if only_id and p.get("id") != only_id:
            continue
        if p.get("id") in done and not only_id:
            continue
        out.append(p)
    return out


# ── 본문 변환 (대시보드 마크다운 → 네이버 에디터에 붙여넣을 HTML / 타이핑용 줄) ──
def inline_md(s):
    s = html.escape(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"(?<!\*)\*(?!\*)(.+?)\*(?!\*)", r"<i>\1</i>", s)
    s = re.sub(r"`(.+?)`", r"\1", s)
    return s


def split_meta(body):
    """첫 줄 '메타디스크립션: …' 은 검색용 요약이라 본문 첫 문단으로 쓰되 접두사는 뗀다."""
    lines = body.replace("\r\n", "\n").split("\n")
    meta = ""
    if lines and lines[0].strip().startswith("메타디스크립션"):
        meta = lines[0].split(":", 1)[1].strip() if ":" in lines[0] else ""
        lines = lines[1:]
    return meta, "\n".join(lines).strip()


def md_to_html(body):
    meta, rest = split_meta(body)
    parts = []
    if meta:
        parts.append(f"<p><i>{inline_md(meta)}</i></p>")
    in_list = None
    for raw in rest.split("\n"):
        line = raw.rstrip()
        if not line.strip():
            if in_list:
                parts.append(f"</{in_list}>")
                in_list = None
            continue
        m = re.match(r"^(#{1,3})\s+(.*)", line)
        if m:
            if in_list:
                parts.append(f"</{in_list}>")
                in_list = None
            level = 2 if len(m.group(1)) <= 2 else 3
            parts.append(f"<h{level}><b>{inline_md(m.group(2).strip())}</b></h{level}>")
            continue
        m = re.match(r"^\s*[-•]\s+(.*)", line)
        if m:
            if in_list != "ul":
                if in_list:
                    parts.append(f"</{in_list}>")
                parts.append("<ul>")
                in_list = "ul"
            parts.append(f"<li>{inline_md(m.group(1))}</li>")
            continue
        m = re.match(r"^\s*\d+[.)]\s+(.*)", line)
        if m:
            if in_list != "ol":
                if in_list:
                    parts.append(f"</{in_list}>")
                parts.append("<ol>")
                in_list = "ol"
            parts.append(f"<li>{inline_md(m.group(1))}</li>")
            continue
        if in_list:
            parts.append(f"</{in_list}>")
            in_list = None
        if line.startswith(">"):
            parts.append(f"<blockquote>{inline_md(line.lstrip('> ').strip())}</blockquote>")
            continue
        parts.append(f"<p>{inline_md(line.strip())}</p>")
    if in_list:
        parts.append(f"</{in_list}>")
    return "\n".join(parts)


def md_to_plain_lines(body):
    """붙여넣기가 안 먹을 때 키보드로 칠 줄 목록. 소제목은 앞뒤 빈 줄로만 구분한다."""
    meta, rest = split_meta(body)
    lines = []
    if meta:
        lines += [meta, ""]
    for raw in rest.split("\n"):
        line = raw.rstrip()
        m = re.match(r"^(#{1,3})\s+(.*)", line)
        if m:
            lines += ["", m.group(2).strip(), ""]
            continue
        line = re.sub(r"\*\*(.+?)\*\*", r"\1", line)
        line = re.sub(r"^\s*[-•]\s+", "· ", line)
        lines.append(line)
    out = []
    for l in lines:
        if l == "" and out and out[-1] == "":
            continue
        out.append(l)
    return out


def extract_tags(body):
    tags = re.findall(r"#([\w가-힣]+)", body)
    seen, out = set(), []
    for t in tags:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out[:10]


# ── 브라우저 ─────────────────────────────────────────────────────────────
def open_browser(cfg):
    from playwright.sync_api import sync_playwright
    pw = sync_playwright().start()
    os.makedirs(cfg["profile_dir"], exist_ok=True)
    ctx = pw.chromium.launch_persistent_context(
        cfg["profile_dir"], channel="chrome", headless=False, viewport=None,
        args=["--start-maximized"], locale="ko-KR",
    )
    return pw, ctx


def is_logged_in(ctx):
    return any(c["name"] == "NID_AUT" for c in ctx.cookies("https://naver.com"))


def cmd_login(cfg):
    pw, ctx = open_browser(cfg)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto("https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fblog.naver.com%2F" + cfg["blog_id"])
    print("[로그인] 열린 크롬에서 네이버에 직접 로그인하세요. '로그인 상태 유지'를 켜 두면 좋습니다.")
    print("         로그인이 확인되면 이 창은 저절로 닫힙니다.")
    for _ in range(600):
        time.sleep(1)
        try:
            if is_logged_in(ctx):
                print("[로그인] 확인됐습니다. 프로필에 저장됐으니 다음부터는 바로 글쓰기가 됩니다.")
                break
        except Exception:
            break
    ctx.close()
    pw.stop()


def human_type(locator, text, cfg):
    lo, hi = cfg.get("type_delay_ms", [30, 90])
    locator.type(text, delay=random.randint(lo, hi))


def editor_frame(page):
    """글쓰기 화면은 mainFrame 안에 에디터가 뜬다. 바로 뜨는 경우도 있어 둘 다 본다."""
    for _ in range(60):
        for fr in page.frames:
            try:
                if fr.locator(".se-title-text, .se-component.se-text").count() > 0:
                    return fr
            except Exception:
                pass
        time.sleep(0.5)
    raise RuntimeError("에디터를 찾지 못했습니다(로그인이 풀렸거나 네이버 화면이 바뀜). --dry-run 으로 화면을 확인하세요.")


def dismiss_popups(fr):
    # "작성 중인 글이 있습니다" → 취소(새 글), 도움말 레이어 닫기 등
    for sel in [".se-popup-button-cancel", "button.se-popup-button-cancel",
                ".se-help-panel-close-button", "button:has-text('취소')"]:
        try:
            loc = fr.locator(sel)
            if loc.count() > 0 and loc.first.is_visible():
                loc.first.click()
                time.sleep(0.6)
        except Exception:
            pass


def paste_html(fr, target, html_str, plain):
    """합성 paste 이벤트로 HTML 을 넣는다. 스마트에디터가 받아 주면 소제목·목록이 살아난다."""
    return fr.evaluate(
        """([sel, htmlStr, plain]) => {
            const el = document.querySelector(sel); if (!el) return false;
            el.focus();
            const dt = new DataTransfer();
            dt.setData('text/html', htmlStr); dt.setData('text/plain', plain);
            const ev = new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true});
            el.dispatchEvent(ev);
            return true;
        }""", [target, html_str, plain])


def body_text_length(fr):
    try:
        return len(fr.locator(".se-main-container").inner_text())
    except Exception:
        return 0


def write_post(page, cfg, post, publish):
    blog = cfg["blog_id"]
    page.goto(f"https://blog.naver.com/{blog}?Redirect=Write&", wait_until="domcontentloaded")
    time.sleep(3)
    if "nid.naver.com" in page.url:
        raise RuntimeError("로그인이 풀렸습니다. python naver_autopost.py --login 을 다시 실행하세요.")
    fr = editor_frame(page)
    dismiss_popups(fr)

    title = (post.get("title") or "").strip()
    body = post.get("body") or ""
    # 제목
    t = fr.locator(".se-title-text").first
    t.click()
    time.sleep(0.5)
    human_type(fr.locator(".se-title-text .se-text-paragraph, .se-title-text").first, title, cfg)
    time.sleep(0.8)
    # 본문 첫 문단으로 이동
    p0 = fr.locator(".se-component.se-text .se-text-paragraph").first
    p0.click()
    time.sleep(0.5)
    html_str = md_to_html(body)
    plain_lines = md_to_plain_lines(body)
    ok = False
    try:
        paste_html(fr, ".se-component.se-text .se-text-paragraph", html_str, "\n".join(plain_lines))
        time.sleep(2)
        ok = body_text_length(fr) > max(200, len(body) * 0.5)
    except Exception:
        ok = False
    if not ok:
        print("[본문] 붙여넣기가 안 먹어 키보드로 입력합니다(2~4분 걸림).")
        p0.click()
        for line in plain_lines:
            if line:
                human_type(fr.locator(".se-component.se-text .se-text-paragraph").last, line, cfg)
            page.keyboard.press("Enter")
            time.sleep(0.05)
    time.sleep(1)
    print(f"[본문] 입력 길이 {body_text_length(fr)}자 (원문 {len(body)}자)")

    if not publish:
        page.screenshot(path=os.path.join(HERE, "dry_run_editor.png"), full_page=False)
        print("[dry-run] 발행하지 않았습니다. 크롬 창에서 모양을 확인한 뒤 이 창에서 Enter 를 누르면 닫습니다.")
        try:
            input()
        except EOFError:
            time.sleep(60)
        return None

    # 발행 버튼(상단) → 발행 레이어의 발행 버튼
    top = fr.locator("button:has-text('발행')").first
    top.click()
    time.sleep(2)
    # 태그 입력(있으면)
    tags = extract_tags(body)
    try:
        tag_in = fr.locator("input#tag-input, input[placeholder*='태그']").first
        if tag_in.count() and tag_in.is_visible():
            for tg in tags[:8]:
                tag_in.type(tg, delay=40)
                page.keyboard.press("Enter")
                time.sleep(0.2)
    except Exception:
        pass
    final = fr.locator("[data-testid='seOnePublishBtn'], .layer_btn_area button:has-text('발행')").first
    final.click()
    # 게시글 주소로 넘어갈 때까지
    url = None
    for _ in range(60):
        time.sleep(1)
        u = page.url
        m = re.search(r"blog\.naver\.com/[^/?#]+/(\d+)", u) or re.search(r"logNo=(\d+)", u)
        if m:
            url = f"https://blog.naver.com/{blog}/{m.group(1)}"
            break
    if not url:
        raise RuntimeError("발행 후 글 주소를 확인하지 못했습니다. 블로그에서 직접 확인하세요.")
    print(f"[발행] {title[:40]}… → {url}")
    return url


def write_result_chunk(cfg, results):
    if not results:
        return None
    now = datetime.now(timezone.utc)
    name = f"ahj_blog_chunk_{now:%Y-%m-%d}-verify-autopost-{now:%H%M%S}.json"
    path = os.path.join(cfg["drive_backup_dir"], name)
    json.dump(results, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"[대시보드] {name} 저장 — Drive 동기화 뒤 대시보드를 열면 발행완료로 바뀝니다.")
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--login", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--id")
    ap.add_argument("--limit", type=int)
    a = ap.parse_args()
    cfg = load_config()
    if a.login:
        cmd_login(cfg)
        return
    st = load_state()
    posts = pending_posts(cfg, st, a.id)
    if a.list or not posts:
        print(f"[대기] 올릴 수 있는 발행대기 글 {len(posts)}건")
        for p in posts:
            print(f"  - {p.get('id')}  {p.get('date')}  {(p.get('title') or '')[:50]}  ({len(p.get('body') or '')}자)")
        if not posts:
            print("  없음. (대시보드에서 발행대기 글을 확인하거나 posted_state.json 을 확인하세요)")
        return
    limit = a.limit or (1 if a.dry_run else cfg.get("posts_per_run", 1))
    posts = posts[:limit]
    pw, ctx = open_browser(cfg)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    try:
        if not is_logged_in(ctx):
            raise RuntimeError("네이버 로그인 상태가 아닙니다. 먼저 python naver_autopost.py --login")
        for i, p in enumerate(posts):
            url = write_post(page, cfg, p, publish=not a.dry_run)
            if url:
                rec = {"id": p["id"], "status": "발행완료", "url": url,
                       "publishedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
                       "publishedBy": "autopost"}
                st["posted"][p["id"]] = {"url": url, "at": rec["publishedAt"]}
                save_state(st)
                write_result_chunk(cfg, [rec])
            if i < len(posts) - 1:
                lo, hi = cfg.get("pause_between_posts_sec", [90, 180])
                w = random.randint(lo, hi)
                print(f"[대기] 다음 글까지 {w}초")
                time.sleep(w)
    except Exception as e:
        print(f"[중단] {e}")
        try:
            page.screenshot(path=os.path.join(HERE, "error.png"))
        except Exception:
            pass
        sys.exit(1)
    finally:
        try:
            ctx.close()
            pw.stop()
        except Exception:
            pass


if __name__ == "__main__":
    main()
