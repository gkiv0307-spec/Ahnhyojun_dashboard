#!/usr/bin/env python3
"""발행대기 블로그 글을 GPT 교환 폴더용 .md 파일로 내보낸다.

사용: python3 scripts/blog_gpt_export.py <snapshot.json|.gz> <outdir> [--skip id1,id2,...]

- 대상: blogPosts 중 status == "발행대기".
- 파일명: <글id>.md  (GPT 는 다듬은 결과를 <글id>_GPT최종.md 로 저장한다)
- 파일 첫 줄에 "# 제목", 이어서 글ID·주제·작성일·출처 메모, 구분선 "---" 다음에 본문.
- --skip 에 적힌 id 는 이미 폴더에 있는 것이므로 만들지 않는다.
"""
import sys, os, json, gzip, base64, argparse

def load_snapshot(path):
    raw = open(path, "rb").read()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    try:
        return json.loads(raw)
    except Exception:
        # base64 로 감싼 경우
        raw = base64.b64decode(raw)
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        return json.loads(raw)

HEADER = """# {title}
- 글ID: {id}   ← 이 줄은 지우지 마세요 (대시보드가 이 값으로 글을 찾습니다)
- 주제: {topic}
- 작성일: {date}
- 상태: {status}
- 출처 메모: {memo}

> GPT 작업 규칙: 다듬은 완성본을 같은 폴더에 `{id}_GPT최종.md` 로 저장하세요.
> 완성본은 첫 줄 `# 제목`(45자 이내), 둘째 줄부터 본문. 본문 첫 줄은 `메타디스크립션: ` 으로 시작(160자 이내),
> 질문형 소제목 2개 이상, 마지막에 `## 핵심 정리`·`## 자주 묻는 질문`·해시태그 5개 이상. 공백 포함 1,500~2,500자.
> 출처 메모에 없는 새 숫자·통계는 넣지 마세요. "무조건/확실한 수익" 같은 단정 표현 금지.

---
"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("snapshot"); ap.add_argument("outdir")
    ap.add_argument("--skip", default="")
    a = ap.parse_args()
    s = load_snapshot(a.snapshot)
    skip = {x.strip() for x in a.skip.split(",") if x.strip()}
    os.makedirs(a.outdir, exist_ok=True)
    made = []
    for p in s.get("blogPosts", []):
        if p.get("status") != "발행대기":
            continue
        pid = p.get("id") or ""
        if not pid or pid in skip:
            continue
        text = HEADER.format(title=p.get("title",""), id=pid, topic=p.get("topic",""),
                             date=p.get("date",""), status=p.get("status",""),
                             memo=(p.get("memo") or "").replace("\n"," ")) + (p.get("body") or "").rstrip() + "\n"
        fn = os.path.join(a.outdir, f"{pid}.md")
        open(fn, "w", encoding="utf-8").write(text)
        made.append((pid, p.get("title",""), len(text)))
    print(f"내보냄 {len(made)}건 → {a.outdir}")
    for pid, t, n in made:
        print(f"  {pid}.md  {n}자  {t[:40]}")
    json.dump([m[0] for m in made], open(os.path.join(a.outdir, "_exported_ids.json"), "w"), ensure_ascii=False)

if __name__ == "__main__":
    main()
