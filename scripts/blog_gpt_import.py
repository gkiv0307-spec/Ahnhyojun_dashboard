#!/usr/bin/env python3
"""GPT 교환 폴더의 <글id>_GPT최종.md 를 읽어 대시보드 blogPosts 패치 청크를 만든다.

사용: python3 scripts/blog_gpt_import.py <snapshot.json|.gz> <gptdir> <out_patch.json>

- gptdir 안의 *_GPT최종.md / *_GPT최종.txt 를 전부 읽는다. 파일명 앞부분이 글ID.
- 파일 형식: 첫 줄 `# 제목` (없으면 기존 제목 유지), 그 뒤가 본문. `- 글ID:` 같은 머리말 줄과 `---` 구분선은 걷어낸다.
- 본문이 스냅샷의 현재 body 와 같으면(이미 반영됨) 건너뛴다.
- status 가 발행대기가 아닌 글(이미 발행완료 등)은 본문을 바꾸지 않고 보고만 한다.
- 결과: [{op:"set", list:"blogPosts", match:{id}, fields:{title?, body, gptReviewedAt, gptSourceFile, memo, stageLog}}]
"""
import sys, os, re, json, gzip, base64, datetime

def load_snapshot(path):
    raw = open(path, "rb").read()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    try:
        return json.loads(raw)
    except Exception:
        raw = base64.b64decode(raw)
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        return json.loads(raw)

def parse_file(text):
    lines = text.replace("\r\n", "\n").split("\n")
    title = None
    i = 0
    # 앞쪽 빈 줄 제거
    while i < len(lines) and not lines[i].strip():
        i += 1
    if i < len(lines) and lines[i].startswith("# "):
        title = lines[i][2:].strip()
        i += 1
    # 머리말(- 글ID: … 등)·인용(>)·구분선 걷어내기: 본문은 '메타디스크립션:' 이 나오는 줄부터,
    # 없으면 첫 비어있지 않은 비-머리말 줄부터.
    rest = lines[i:]
    start = None
    for j, l in enumerate(rest):
        if l.strip().startswith("메타디스크립션"):
            start = j; break
    if start is None:
        for j, l in enumerate(rest):
            s = l.strip()
            if not s or s.startswith("- ") or s.startswith(">") or s == "---":
                continue
            start = j; break
    body = "\n".join(rest[start:]).strip() if start is not None else ""
    return title, body

def main():
    snap, gptdir, out = sys.argv[1], sys.argv[2], sys.argv[3]
    s = load_snapshot(snap)
    posts = {p.get("id"): p for p in s.get("blogPosts", [])}
    now = datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    today = datetime.datetime.utcnow().strftime("%m/%d")
    ops, report = [], []
    for fn in sorted(os.listdir(gptdir)):
        m = re.match(r"^(.+?)_GPT최종(?:\.\w+)?\.(md|txt)$", fn)
        if not m:
            continue
        pid = m.group(1).strip()
        text = open(os.path.join(gptdir, fn), encoding="utf-8", errors="replace").read()
        title, body = parse_file(text)
        # 파일 안의 "- 글ID: …" 가 파일명과 다르면 다른 글을 잘못 저장한 것이므로 건너뛴다
        m2 = re.search(r"글ID:\s*([\w\-]+)", text)
        if m2 and m2.group(1) != pid:
            report.append(f"SKIP {fn}: 파일 안 글ID({m2.group(1)})가 파일명({pid})과 다름"); continue
        p = posts.get(pid)
        if not p:
            report.append(f"SKIP {fn}: 대시보드에 글ID {pid} 없음"); continue
        if not body or len(body) < 300:
            report.append(f"SKIP {fn}: 본문이 비어 있거나 너무 짧음({len(body)}자)"); continue
        if p.get("status") != "발행대기":
            report.append(f"SKIP {fn}: 상태가 {p.get('status')} (발행대기가 아니라 본문 안 바꿈)"); continue
        if (p.get("body") or "").strip() == body:
            report.append(f"SAME {fn}: 이미 반영됨"); continue
        warn = []
        if not body.startswith("메타디스크립션"):
            warn.append("메타디스크립션 첫 줄 없음")
        if len(body) < 1500:
            warn.append(f"{len(body)}자로 1,500자 미만")
        if title and len(title) > 45:
            warn.append(f"제목 {len(title)}자(45자 초과)")
        fields = {"body": body, "gptReviewedAt": now, "gptSourceFile": fn,
                  "memo": ((p.get("memo") or "").rstrip() + f" · GPT 최종본 반영 {today}").strip(" ·"),
                  "stageLog": list(p.get("stageLog") or []) + [{"stage": "GPT최종", "by": "GPT (대리님 검수)", "at": now,
                      "note": f"{fn} 반영 · {len(body)}자" + (" · 주의: " + ", ".join(warn) if warn else "")}]}
        if title and title != p.get("title"):
            fields["title"] = title
        ops.append({"op": "set", "list": "blogPosts", "match": {"id": pid}, "fields": fields})
        report.append(f"OK   {fn}: {len(body)}자" + (f" · 제목 변경 → {title}" if 'title' in fields else "") + (" · 주의 " + ", ".join(warn) if warn else ""))
    json.dump(ops, open(out, "w"), ensure_ascii=False, indent=1)
    print("\n".join(report) if report else "GPT최종 파일 없음")
    print(f"패치 {len(ops)}건 → {out}")

if __name__ == "__main__":
    main()
