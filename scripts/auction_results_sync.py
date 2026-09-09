#!/usr/bin/env python3
"""데일리 경매분석 결과 자동 동기화.

입력: 대시보드 스냅샷 JSON(다운로드해 base64 디코드한 것)과 현황판 아티팩트 HTML(Artifact read로 저장된 파일).
출력: ahj_market_chunk_*.json 에 넣을 배열(JSON) — caseNumber 기준 upsert 되므로 바꿀 필드만 담는다.

규칙 (현황판 D 항목의 ld = 회차별 기록 [{d, amt, res}], final, resultDesc 사용):
- 대시보드 물건 중 매각기일(saleDate)이 지났고 상태가 조사중/입찰예정 인 것만 본다.
- 그 매각기일 회차의 res 가 '유찰' → status 유찰, failCount 갱신, 다음 회차가 있으면 saleDate·minSalePrice 를 다음 회차로 옮긴다.
- res 가 '변경' → status 변경, 다음 회차로 옮긴다.
- res 가 '매각(금액)' → status 매각종료, winningBid 에 금액. (대리님이 입찰했으면 대시보드에서 낙찰/패찰로 바꾼다)
- final 이 '취하' → status 취하. '기각'·'각하'도 취하로 본다.
- 회차 res 가 비어 있으면(현황판 데이터가 아직 결과를 못 받음) 건드리지 않고 '대기' 목록에 남긴다.
사용: python3 auction_results_sync.py snapshot.json board.html out.json [YYYY-MM-DD]
"""
import json, re, sys, datetime

def load_board_items(html_path):
    html = open(html_path, encoding="utf-8").read()
    m = re.search(r"^const D = (\[.*?\]);$", html, re.M)
    if not m:
        raise SystemExit("현황판 HTML에서 D 배열을 찾지 못함")
    items = json.loads(m.group(1))
    by = {}
    for x in items:
        by.setdefault(x.get("caNo"), []).append(x)
    return by

def parse_amount(res):
    m = re.search(r"\(([\d,]+)원\)", res or "")
    return int(m.group(1).replace(",", "")) if m else 0

def sync(snapshot, board_by, today):
    updates, waiting, missing = [], [], []
    for mm in snapshot.get("marketAuctions", []):
        sd = mm.get("saleDate") or ""
        if not sd or sd >= today or mm.get("status") not in ("조사중", "입찰예정"):
            continue
        ca = (mm.get("caseNumber") or "").split(" ")[0]
        ca = re.sub(r"\(\d+\)$", "", ca)
        cands = board_by.get(ca) or []
        if not cands:
            missing.append(mm); continue
        # 물건번호가 있으면 맞추고, 없으면 첫 항목
        ino = None
        mi = re.search(r"물건(\d+)|\((\d+)\)", mm.get("caseNumber") or "")
        if mi: ino = int(mi.group(1) or mi.group(2))
        x = next((c for c in cands if ino is None or (c.get("ino") or 1) == ino), cands[0])
        ld = x.get("ld") or []
        final = (x.get("final") or "")
        upd = {"caseNumber": mm["caseNumber"], "updatedAt": datetime.datetime.utcnow().isoformat() + "Z"}
        memo_add = ""
        if final in ("취하", "기각", "각하"):
            upd["status"] = "취하"; memo_add = f"현황판: 사건 {final} ({x.get('closedAt') or ''})"
        else:
            rnd = next((r for r in ld if r.get("d") == sd), None)
            if rnd is None:
                # 대시보드 매각기일과 정확히 같은 회차가 없으면, 오늘 이전 마지막 결과 회차를 쓴다
                past = [r for r in ld if (r.get("d") or "") < today and r.get("res")]
                rnd = past[-1] if past else None
            if not rnd or not rnd.get("res"):
                waiting.append((mm, x)); continue
            res = rnd["res"]
            nxt = next((r for r in ld if (r.get("d") or "") > (rnd.get("d") or "")), None)
            if res.startswith("매각"):
                upd["status"] = "매각종료"; upd["winningBid"] = parse_amount(res)
                memo_add = f"현황판: {rnd['d']} {res} (타인 낙찰 — 직접 입찰했으면 낙찰/패찰로 바꿔주세요)"
            elif res.startswith("유찰") or res.startswith("변경"):
                upd["status"] = "유찰" if res.startswith("유찰") else "변경"
                upd["failCount"] = int(x.get("f") or sum(1 for r in ld if (r.get("res") or "").startswith("유찰")))
                if nxt:
                    upd["saleDate"] = nxt["d"]; upd["minSalePrice"] = nxt.get("amt") or mm.get("minSalePrice")
                    upd["status"] = "입찰예정" if res.startswith("유찰") else "변경"
                    memo_add = f"현황판: {rnd['d']} {res} → 다음 {nxt['d']} 최저 {nxt.get('amt'):,}원"
                else:
                    memo_add = f"현황판: {rnd['d']} {res}"
            else:
                waiting.append((mm, x)); continue
        if memo_add:
            old = (mm.get("memo") or "").strip()
            upd["memo"] = (old + " · " if old else "") + memo_add
        updates.append(upd)
    return updates, waiting, missing

if __name__ == "__main__":
    snap_path, board_path, out_path = sys.argv[1:4]
    today = sys.argv[4] if len(sys.argv) > 4 else datetime.date.today().isoformat()
    snap = json.load(open(snap_path, encoding="utf-8"))
    updates, waiting, missing = sync(snap, load_board_items(board_path), today)
    json.dump(updates, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"updates {len(updates)} | waiting {len(waiting)} | not in board {len(missing)}")
    for u in updates: print("  UPD", u["caseNumber"], u.get("status"), u.get("saleDate", ""), u.get("winningBid", ""))
    for mm, x in waiting: print("  WAIT", mm["caseNumber"], mm.get("saleDate"), "(현황판 결과 없음)")
    for mm in missing: print("  MISS", mm["caseNumber"], mm.get("saleDate"))
