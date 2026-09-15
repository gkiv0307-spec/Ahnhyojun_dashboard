#!/usr/bin/env python3
"""데일리 경매분석 결과 자동 동기화.

입력: 대시보드 스냅샷 JSON(다운로드해 base64 디코드한 것)과 현황판 아티팩트 HTML(Artifact read로 저장된 파일).
출력: ahj_market_chunk_*.json 에 넣을 배열(JSON) — caseNumber 기준 upsert 되므로 바꿀 필드만 담는다.

규칙 (현황판 D 항목의 ld = 회차별 기록 [{d, amt, res}], final, resultDesc 사용):
- 대시보드 물건 중 매각기일(saleDate)이 지났고 상태가 조사중/입찰예정/매각/유찰 인 것만 본다.
  ("매각"·"유찰" 은 현황판이 결과만 적고 낙찰가·다음 회차를 안 채운 중간 상태다.)
- 그 매각기일 회차의 res 가 '유찰' → status 유찰, failCount 갱신, 다음 회차가 있으면 saleDate·minSalePrice 를 다음 회차로 옮긴다.
- res 가 '변경' → status 변경, 다음 회차로 옮긴다.
- res 가 '매각(금액)' → status 매각종료, winningBid 에 금액. (대리님이 입찰했으면 대시보드에서 낙찰/패찰로 바꾼다)
- final 이 '취하' → status 취하. '기각'·'각하'도 취하로 본다.
- 회차 res 가 비어 있으면(현황판 데이터가 아직 결과를 못 받음) 건드리지 않고 '대기' 목록에 남긴다.
사용: python3 auction_results_sync.py snapshot.json board.json out.json [YYYY-MM-DD] [--all]
  --all: 매각기일이 안 지난 물건도 법원 기록으로 진행중/취하/변경을 확인해 courtResult 에 적는다.
"""
import json, re, sys, datetime

def load_board_items(path):
    """회차 기록을 읽는다. 두 가지 소스를 모두 받는다.

    - 현황판 아티팩트 HTML (const D = [...])
    - court_auction_fetch.py 가 법원경매정보에서 받아 저장한 JSON (같은 모양)

    법원경매정보가 1차 자료라 그쪽을 우선 쓰고, 현황판은 보조로 남겨둔다.
    """
    raw = open(path, encoding="utf-8").read()
    if path.endswith(".json"):
        items = json.loads(raw)
    else:
        m = re.search(r"^const D = (\[.*?\]);$", raw, re.M)
        if not m:
            raise SystemExit("현황판 HTML에서 D 배열을 찾지 못함")
        items = json.loads(m.group(1))
    by = {}
    for x in items:
        by.setdefault(x.get("caNo"), []).append(x)
    return by

def src(x):
    """이 기록을 어디서 받았는지 메모에 남긴다."""
    return "법원경매정보" if x.get("csNo") else "현황판"


def parse_amount(res):
    m = re.search(r"\(([\d,]+)원\)", res or "")
    return int(m.group(1).replace(",", "")) if m else 0

# 대리님이 손으로 정한 결과. 여기는 건드리지 않는다.
USER_FINAL = ("낙찰", "패찰")
# 아직 진행 중으로 볼 수 있는 상태. --all 에서 법원 기록으로 진행/취하/변경을 확인한다.
OPEN_STATUS = ("조사중", "입찰예정", "매각", "유찰", "변경")


def fmt_md(d):
    return f"{int(d[5:7])}/{int(d[8:10])}" if d and len(d) >= 10 else d


def sync(snapshot, board_by, today, check_all=False):
    """check_all=False: 매각기일이 지난 물건의 결과만 판정한다(예전 동작).
    check_all=True: 매각기일이 안 지난 물건도 법원 기록으로 확인한다 —
      취하·취소·기각은 기일 전에도 생기고, 기일이 바뀌기도 한다(변경·추후지정).
      대리님은 "이 물건이 아직 진행 중인지 끝났는지" 를 카드에서 바로 보고 싶어 한다.
      그래서 진행 중이면 courtResult 에 '진행중 · 매각기일 M/D 최저 X원' 을 적고,
      대시보드 매각기일·최저가가 법원과 다르면 법원 것으로 맞춘다."""
    updates, waiting, missing = [], [], []
    for mm in snapshot.get("marketAuctions", []):
        sd = mm.get("saleDate") or ""
        st = mm.get("status")
        if st in USER_FINAL:
            continue
        past_due = bool(sd) and sd < today and st in ("조사중", "입찰예정", "매각", "유찰")
        # 현황판은 낙찰된 물건을 status "매각" 으로만 적고 낙찰가는 안 채운다.
        # 그것도 결과가 덜 들어온 상태이므로 여기서 매각종료 + 낙찰가로 마무리한다.
        # "유찰" 도 다음 회차가 잡히면 입찰예정으로 넘겨야 해서 함께 본다.
        if not past_due and not (check_all and st in OPEN_STATUS):
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
            upd["status"] = "취하"; memo_add = f"{src(x)}: 사건 {final} ({x.get('closedAt') or ''})"
        else:
            rnd = next((r for r in ld if r.get("d") == sd), None)
            if rnd is None:
                # 대시보드 매각기일과 정확히 같은 회차가 없으면, 오늘 이전 마지막 결과 회차를 쓴다
                past = [r for r in ld if (r.get("d") or "") < today and r.get("res")]
                rnd = past[-1] if past else None
            if not rnd or not rnd.get("res"):
                if past_due:
                    waiting.append((mm, x)); continue
                # 기일이 아직 안 왔다 — 법원 기록으로 "진행 중" 을 확인하고 다음 회차를 맞춘다.
                nxt = next((r for r in ld if (r.get("d") or "") >= today), None)
                if nxt:
                    label = f"진행중 · 매각기일 {fmt_md(nxt['d'])} 최저 {int(nxt.get('amt') or 0):,}원"
                    if nxt["d"] != sd:
                        upd["saleDate"] = nxt["d"]; label += f" (대시보드 {fmt_md(sd) or '미정'} → 법원 {fmt_md(nxt['d'])} 로 맞춤)"
                    if nxt.get("amt") and int(nxt["amt"]) != int(mm.get("minSalePrice") or 0):
                        upd["minSalePrice"] = int(nxt["amt"])
                else:
                    label = "진행중 · 다음 매각기일 미지정"
                fc = int(x.get("f") or 0)
                if fc != int(mm.get("failCount") or 0):
                    upd["failCount"] = fc
                upd["courtResult"] = label
                upd["courtCheckedAt"] = today
                updates.append(upd); continue
            res = rnd["res"]
            nxt = next((r for r in ld if (r.get("d") or "") > (rnd.get("d") or "")), None)
            if res.startswith("매각"):
                upd["status"] = "매각종료"; upd["winningBid"] = parse_amount(res)
                memo_add = f"{src(x)}: {rnd['d']} {res} (타인 낙찰 — 직접 입찰했으면 낙찰/패찰로 바꿔주세요)"
            elif res.startswith("유찰") or res.startswith("변경"):
                upd["status"] = "유찰" if res.startswith("유찰") else "변경"
                upd["failCount"] = int(x.get("f") or sum(1 for r in ld if (r.get("res") or "").startswith("유찰")))
                if nxt:
                    upd["saleDate"] = nxt["d"]; upd["minSalePrice"] = nxt.get("amt") or mm.get("minSalePrice")
                    upd["status"] = "입찰예정" if res.startswith("유찰") else "변경"
                    memo_add = f"{src(x)}: {rnd['d']} {res} → 다음 {nxt['d']} 최저 {nxt.get('amt'):,}원"
                else:
                    memo_add = f"{src(x)}: {rnd['d']} {res}"
            else:
                waiting.append((mm, x)); continue
        if memo_add:
            old = (mm.get("memo") or "").strip()
            # --all 로 매일 돌면 같은 결과를 매일 다시 보게 된다. 이미 적힌 문장은 또 붙이지 않는다.
            if memo_add not in old:
                upd["memo"] = (old + " · " if old else "") + memo_add
            upd["courtResult"] = memo_add.split(": ", 1)[-1].split(" (타인")[0]
            upd["courtCheckedAt"] = today
        updates.append(upd)
    return updates, waiting, missing

if __name__ == "__main__":
    check_all = "--all" in sys.argv
    sys.argv = [a for a in sys.argv if a != "--all"]
    snap_path, board_path, out_path = sys.argv[1:4]
    # 대시보드는 한국시각 기준으로 "매각기일 지남"을 판단한다. 이 스크립트를 UTC 날짜로
    # 돌리면 07시(KST) 루틴에서는 UTC가 아직 전날이라, 어제 매각된 건이 하루 동안
    # "결과 미입력"으로 남는다. 인자를 안 주면 KST(UTC+9) 오늘 날짜를 쓴다.
    today = sys.argv[4] if len(sys.argv) > 4 else (
        datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat())
    snap = json.load(open(snap_path, encoding="utf-8"))
    updates, waiting, missing = sync(snap, load_board_items(board_path), today, check_all)
    json.dump(updates, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"updates {len(updates)} | waiting {len(waiting)} | 소스에 없음 {len(missing)}")
    for u in updates: print("  UPD", u["caseNumber"], u.get("status"), u.get("saleDate", ""), u.get("winningBid", ""))
    for mm, x in waiting: print("  WAIT", mm["caseNumber"], mm.get("saleDate"), "(결과 아직 없음)")
    for mm in missing: print("  MISS", mm["caseNumber"], mm.get("saleDate"))
