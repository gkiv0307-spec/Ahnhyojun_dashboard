#!/usr/bin/env python3
"""법원경매정보(courtauction.go.kr)에서 사건별 기일내역을 받아온다.

대시보드 marketAuctions 의 각 물건에 대해 법원경매정보 공식 사이트를 조회해
회차별 기록(유찰·매각·변경)과 사건 종국(취하·취소·기각·각하)을 뽑아,
현황판 HTML 의 D 배열과 같은 모양으로 저장한다.
그러면 auction_results_sync.py 가 현황판 대신 이 파일을 그대로 읽어 쓸 수 있다.

왜 법원경매정보인가:
  현황판은 다른 세션이 빌드하는 2차 자료라 결과가 늦게 붙거나 아예 안 붙는다.
  법원경매정보는 1차 자료라 매각 다음 날이면 결과가 확정돼 있다.

사용:
  python3 court_auction_fetch.py snapshot.json board_from_court.json [--all] [--chunks c1.json c2.json ...]
  기본은 "결과가 필요한 물건"만 조회한다(매각기일이 지났고 상태가 조사중/입찰예정/매각/유찰).
  --all 을 주면 marketAuctions 전체를 조회한다(느리다).
  --chunks 로 스냅샷 이후 올라온 ahj_market_chunk_*.json 을 함께 주면 그것까지 합쳐서 본다
  (스냅샷은 대시보드를 열어야 갱신되므로, 그 사이 등록된 물건은 이걸 줘야 보인다).

출력 형식(현황판 D 와 동일):
  [{caNo, ino, court, cortOfcCd, csNo, f, final, ld:[{d, amt, res}]}]
  res 는 "유찰" / "변경" / "매각(88,999,999원)" 처럼 현황판 표기를 그대로 쓴다.
"""
import json, re, sys, time, datetime, urllib.request, urllib.error

BASE = "https://www.courtauction.go.kr/pgj"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
# 사건부호 '타경'(부동산 경매) 코드. csNo = 연도(4) + 부호(4) + 일련번호(6)
CS_CODE_TAGYEONG = "0130"
# 종국구분코드 → 대시보드에서 쓰는 말
ULTMT = {"107": "기각", "108": "각하", "204": "취하", "205": "취소", "044": "이송"}
# 사건진행상태코드 (종국구분이 비어 있을 때 보조로 본다)
PROG_CLOSED = {"0002100003": "취소", "0002100004": "취하"}
REQ_GAP_SEC = 0.7      # 공공 사이트이므로 천천히 두드린다
MAX_RETRY = 5


def post(path, payload, pgmid):
    """법원경매정보 JSON API 호출. 프록시가 간헐적으로 끊어서 반드시 재시도한다."""
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=body, method="POST")
    for k, v in {
        "Content-Type": "application/json;charset=UTF-8",
        "Accept": "application/json",
        "User-Agent": UA,
        "Referer": BASE + "/index.on",
        "SC-Pgmid": pgmid, "SC-Userid": "", "SC-Useragent": "",
        "SC-Pageno": "", "SC-Tablejs": "", "SC-Callid": "",
    }.items():
        req.add_header(k, v)
    last = None
    for attempt in range(MAX_RETRY):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:          # 연결 리셋·타임아웃·5xx 모두 여기로 온다
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"{path} 호출 실패: {last}")


_court_cache = None

def court_list():
    global _court_cache
    if _court_cache is None:
        d = post("/scframe/lib/sccort/list.on", {}, "PGJ111M01")
        _court_cache = d["data"]["scortList"]
    return _court_cache


def _norm_court(name):
    """'대구지방법원 서부지원 1계' · '대구서부지원 2계' → '대구서부지원' 처럼 납작하게."""
    s = re.sub(r"\s*제?\d+계\s*$", "", (name or "").strip())
    s = s.replace("지방법원", "지법").replace(" ", "")
    return s


def court_code(name):
    """대시보드의 자유 형식 법원명을 법원경매정보 cortOfcCd('B'+코드) 로 바꾼다."""
    want = _norm_court(name)
    if not want:
        return None
    best = None
    for c in court_list():
        # 경매는 지방법원·지원만 본다(가정법원·고법 제외)
        if c.get("cortTypCd") not in ("40", "70"):
            continue
        cand = _norm_court(c.get("cortAbrvtdNm"))
        if cand == want:
            return "B" + c["cortCd"]
        # '대구지법서부지원' 과 '대구서부지원' 을 같은 것으로 본다
        if cand.replace("지법", "") == want.replace("지법", ""):
            best = "B" + c["cortCd"]
        # 현황판은 '경주지원'·'부천지원' 처럼 본원 이름을 떼고 보낸다. 지원 이름만으로도 맞춘다.
        # (전국에서 지원 이름이 겹치는 곳은 없다 — 법원 목록으로 확인함)
        if not best and want.endswith("지원") and cand.endswith(want):
            best = "B" + c["cortCd"]
    return best


def case_no(case_number):
    """'2025타경1245 물건1' → ('20250130001245', 1)."""
    m = re.search(r"(20\d\d)\s*타경\s*(\d+)", case_number or "")
    if not m:
        return None, None
    ino = None
    mi = re.search(r"물건\s*(\d+)|\((\d+)\)", case_number)
    if mi:
        ino = int(mi.group(1) or mi.group(2))
    return m.group(1) + CS_CODE_TAGYEONG + m.group(2).zfill(6), ino


def _amount(text):
    m = re.search(r"([\d,]+)\s*원", text or "")
    return int(m.group(1).replace(",", "")) if m else 0


def fetch_case(cort, csno, ino):
    """한 사건의 회차 기록과 종국 상태를 현황판 D 항목 모양으로 만든다."""
    dx = post("/pgj15A/selectCsDtlDxdyDts.on",
              {"dma_srchDxdyDtsLst": {"cortOfcCd": cort, "csNo": csno}}, "PGJ15AF02")
    rows = (dx.get("data") or {}).get("dlt_dxdyDtsLst") or []
    ld = []
    for r in rows:
        # 매각기일만 쓴다. 매각결정기일·대금지급기한·배당기일은 결과 판정과 무관하다.
        if r.get("auctnDxdyKndNm") != "매각기일":
            continue
        # 물건번호가 있는 사건은 그 물건의 회차만 본다
        if ino is not None and str(r.get("dspslGdsSeq") or "") not in ("", str(ino)):
            continue
        dm = re.match(r"(\d{4})\.(\d{2})\.(\d{2})", r.get("dxdyTime") or "")
        if not dm:
            continue
        res = re.sub(r"<[^>]+>", "", r.get("dxdyRslt") or "").strip()
        res = re.sub(r"\s+", "", res)          # '매각 (88,999,999원)' → '매각(88,999,999원)'
        ld.append({"d": "-".join(dm.groups()), "amt": _amount(r.get("tsLwsDspslPrc")), "res": res})
    ld.sort(key=lambda x: x["d"])
    # 감정가. 아래에서 대시보드 값과 대조해 엉뚱한 사건을 물어왔는지 확인한다.
    aee = next((int(r["aeeEvlAmt"]) for r in rows if str(r.get("aeeEvlAmt") or "").isdigit()), 0)

    # 종국(취하·취소·기각·각하)은 기일내역에 안 나오므로 사건기본정보에서 따로 본다.
    cs = post("/pgj15A/selectAuctnCsSrchRslt.on",
              {"dma_srchCsDtlInf": {"cortOfcCd": cort, "csNo": csno}}, "PGJ15AF01")
    bas = (cs.get("data") or {}).get("dma_csBasInf") or {}
    final = ULTMT.get(str(bas.get("ultmtDvsCd") or "").zfill(3), "")
    if not final:
        final = PROG_CLOSED.get(str(bas.get("csProgStatCd") or ""), "")
    return {
        "cortOfcCd": cort, "csNo": csno, "ino": ino, "ld": ld, "final": final, "aeeEvlAmt": aee,
        "f": sum(1 for x in ld if x["res"].startswith("유찰")),
        "closedAt": _fmt_ymd(bas.get("csUltmtYmd")),
        "courtName": bas.get("cortOfcNm") or "",
    }


def _fmt_ymd(v):
    s = str(v or "")
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}" if len(s) == 8 and s.isdigit() else ""


def apply_market_chunks(snapshot, paths):
    """스냅샷 이후 올라온 ahj_market_chunk_*.json 을 얹어 '지금 대시보드' 상태를 만든다.

    스냅샷은 대시보드가 열릴 때만 Drive 에 올라간다. 대리님이 며칠 안 열면
    스냅샷이 그대로 멈춰 있고, 그 사이 현황판이 보낸 새 물건은 루틴 눈에 안 보인다.
    실제로 2025타경9339(9/12 등록)가 그래서 9/14 매각기일이 지나도록 방치됐다.
    대시보드가 하는 것과 같은 방식(caseNumber 기준 upsert)으로 여기서도 합친다.
    """
    lst = snapshot.setdefault("marketAuctions", [])
    by = {}
    for i, m in enumerate(lst):
        by[(m.get("caseNumber") or "").strip()] = i
    added = updated = 0
    for path in paths:
        try:
            rows = json.load(open(path, encoding="utf-8"))
        except Exception as e:
            print(f"  청크 못 읽음 {path}: {e}")
            continue
        for r in rows if isinstance(rows, list) else []:
            key = (r.get("caseNumber") or "").strip()
            if not key:
                continue
            if key in by:
                lst[by[key]].update(r); updated += 1
            else:
                by[key] = len(lst); lst.append(dict(r)); added += 1
    if paths:
        print(f"청크 반영: 새 물건 {added}건 · 갱신 {updated}건 (물건 총 {len(lst)}건)")
    return snapshot


def targets(snapshot, today, want_all):
    """조회할 물건을 고른다. 기본은 결과가 아직 없는 것만."""
    out = []
    for mm in snapshot.get("marketAuctions", []):
        if not want_all:
            sd = mm.get("saleDate") or ""
            # sync 쪽과 같은 기준으로 고른다. "매각"·"유찰" 은 현황판이 결과만 적고
            # 낙찰가·다음 회차를 안 채운 중간 상태라 여기서 마저 받아와야 한다.
            if not sd or sd >= today or mm.get("status") not in ("조사중", "입찰예정", "매각", "유찰"):
                continue
        out.append(mm)
    return out


def main():
    argv = sys.argv[1:]
    want_all = "--all" in argv
    # --chunks 뒤에 오는 경로들은 스냅샷 위에 얹을 ahj_market_chunk_*.json 이다.
    chunk_paths = []
    if "--chunks" in argv:
        i = argv.index("--chunks")
        chunk_paths = [a for a in argv[i + 1:] if not a.startswith("--")]
        argv = argv[:i]
    args = [a for a in argv if not a.startswith("--")]
    snap_path, out_path = args[0], args[1]
    today = args[2] if len(args) > 2 else datetime.datetime.now(
        datetime.timezone(datetime.timedelta(hours=9))).date().isoformat()

    snap = json.load(open(snap_path, encoding="utf-8"))
    apply_market_chunks(snap, chunk_paths)
    items, failed = [], []
    todo = targets(snap, today, want_all)
    print(f"조회 대상 {len(todo)}건 (기준일 {today})")
    for mm in todo:
        ca = (mm.get("caseNumber") or "").split(" ")[0]
        ca = re.sub(r"\(\d+\)$", "", ca)
        csno, ino = case_no(mm.get("caseNumber"))
        cort = court_code(mm.get("court"))
        if not csno or not cort:
            failed.append((mm.get("caseNumber"), f"사건번호/법원 해석 실패 (court={mm.get('court')!r})"))
            continue
        try:
            rec = fetch_case(cort, csno, ino)
        except Exception as e:
            failed.append((mm.get("caseNumber"), str(e)))
            continue
        time.sleep(REQ_GAP_SEC)
        if not rec["ld"] and not rec["final"]:
            failed.append((mm.get("caseNumber"), "법원경매정보에 기일내역 없음"))
            continue
        # 법원 매핑이나 사건번호 변환이 틀리면 "있긴 한 다른 사건"이 조용히 딸려온다.
        # 감정가가 다르면 그 사건이 아니므로 쓰지 않고 사람이 보게 남긴다.
        want_aee = mm.get("appraisalValue") or 0
        if want_aee and rec["aeeEvlAmt"] and int(want_aee) != rec["aeeEvlAmt"]:
            failed.append((mm.get("caseNumber"),
                           f"감정가 불일치 — 대시보드 {int(want_aee):,}원 vs 법원 {rec['aeeEvlAmt']:,}원 "
                           f"({rec['courtName']} {csno}). 다른 사건을 물어왔을 수 있어 건너뜀"))
            continue
        rec["caNo"] = ca
        rec["court"] = mm.get("court")
        items.append(rec)
        last = rec["ld"][-1] if rec["ld"] else {}
        print(f"  {ca} {rec['courtName']} 회차{len(rec['ld'])} "
              f"최근 {last.get('d','')} {last.get('res','')} {('종국:'+rec['final']) if rec['final'] else ''}")

    json.dump(items, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"\n받음 {len(items)}건 → {out_path}")
    for ca, why in failed:
        print(f"  못받음 {ca}: {why}")
    # 전부 실패하면 루틴이 조용히 0건으로 넘어가지 않도록 실패로 끝낸다
    if todo and not items:
        sys.exit(1)


if __name__ == "__main__":
    main()
