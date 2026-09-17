아침 점검 시간입니다 (07시 KST). CLAUDE.md 6절의 이 루틴 설명을 먼저 읽고, 아래 A~D를 순서대로 처리해줘. 각 단계는 실패해도 다음 단계를 계속 진행한다.

공통: Drive 백업 폴더 parentId = 1ZkIT6DPRGBg8DYu9ezNTEjo6ekUJMvZ4. 스냅샷 전체(ahj_dashboard_snapshot.json / .json.gz)는 절대 수정·재업로드하지 않는다. 학생 이름·연락처·계좌 같은 민감정보는 보고서 본문에 넣지 않는다. 도구가 "세션 만료"로 실패하면 ToolSearch로 다시 로드해 한 번 더 시도한다.

**A. 경매 결과·진행 자동 확인 (법원경매정보 1차 자료, 전 물건)**

1. Drive 폴더에서 스냅샷을 **정확한 제목으로** 검색한다: `(title = 'ahj_dashboard_snapshot.json.gz' or title = 'ahj_dashboard_snapshot.json') and parentId = '1ZkIT6DPRGBg8DYu9ezNTEjo6ekUJMvZ4'` → modifiedTime 이 가장 최근인 파일을 받는다. `title contains` 로 찾으면 안 된다 — 폴더에 `ahj_dashboard_snapshot_이전전보관_2026-09-11.json` 처럼 이름을 바꿔 둔 옛 파일이 있고, 이름을 바꾼 시각이 modifiedTime 이 되어 "최신"으로 잘못 잡힌다(2026-09-18 확인). 2026-09-16 부터 대시보드는 gzip 압축본(.json.gz, 정상 크기 150~400KB)으로 올린다 — 1MB 를 넘긴 평문 저장이 전부 실패했기 때문이다. base64 를 디코드한 바이트가 `1f 8b` 로 시작하면 `gzip.decompress` 로 풀어 평문 JSON 을 로컬 `snapshot.json` 으로 저장한다(Python: `import gzip,base64,json; raw=base64.b64decode(content); raw=gzip.decompress(raw) if raw[:2]==b'\x1f\x8b' else raw; open('snapshot.json','wb').write(raw)`). 평문 .json 이면 900KB 근처가 정상이고, 수십~수백 KB 짜리 평문은 빈 부분 스냅샷이니 쓰지 말고 그 다음 정상 파일을 쓴다. scripts/*.py 는 압축본을 그대로 넘겨도 읽는다.
2. **그 스냅샷보다 나중에 올라온 `ahj_market_chunk_*.json` 을 전부 받는다.** 스냅샷은 대리님이 대시보드를 열어야 갱신되는데 며칠씩 안 열리는 일이 잦다. 그 사이 현황판이 보낸 새 물건은 스냅샷에 없어서, 이걸 안 합치면 통째로 빠진다(2025타경9339 가 실제로 그렇게 방치됐다). `_results` 가 붙은 내가 만든 파일은 넣어도 된다(어차피 upsert).
3. `python3 scripts/court_auction_fetch.py <snapshot> <board.json> --all --chunks <받은 청크들...>` 로 **모든 물건**(낙찰·패찰·매각종료·취하 등 끝난 것 제외 없이 전부 — 스크립트가 알아서 거른다)의 기일내역을 받는다. 대리님은 "이 물건이 아직 진행 중인지 끝났는지" 를 카드에서 바로 보고 싶어 한다. 취하·취소·기각은 매각기일 전에도 생기고 기일이 바뀌기도 하므로, 기일이 안 지난 물건도 매일 확인한다. 88건 기준 3분쯤 걸린다. 감정가가 대시보드와 다르면 다른 사건을 물어온 것이므로 건너뛰고 실패 목록에 남는다 — 그건 사람이 봐야 하니 보고에 적는다.
4. 스냅샷에 같은 청크들을 얹은 파일을 만들어 `python3 scripts/auction_results_sync.py <merged_snapshot> <board.json> <out.json> --all` 로 판정한다. 기일이 지난 것은 유찰(다음 회차로 이동)·매각종료(타인 낙찰가)·변경·취하로, 기일이 안 지난 것은 `courtResult` 에 "진행중 · 매각기일 M/D 최저 X원"(대시보드 기일이 법원과 다르면 법원 것으로 맞춤) 또는 취하·변경으로 적는다. `courtCheckedAt` 에 확인 날짜가 남아 카드에 "법원 확인 M/D: …" 로 보인다.
5. out.json 이 비어 있지 않으면 `ahj_market_chunk_<오늘날짜>_results.json` 으로 업로드한다. 0건이면 올리지 않는다.
6. 대리님이 손으로 정한 낙찰·패찰은 건드리지 않는다 — 그 외에는 내가 다 넣는다.

**B. 네이버 블로그 발행 확인 (RSS)**

`python3 scripts/blog_rss_fetch.py naver_results.json` 로 우리 블로그 3곳(ykphone_edu · hjko0 · gkgk0307_) RSS 를 받고, `python3 scripts/blog_publish_match.py <snapshot> naver_results.json verify_chunk.json backfill_chunk.json` 으로 대조한다. 각각 비어 있지 않을 때만 `ahj_blog_chunk_<날짜>-verify.json`(발행완료+주소 채우기)과 `ahj_patch_chunk_<날짜>_blogbackfill.json`(대시보드에 없던 글 등록)으로 올린다. 매칭 키는 제목이 아니라 사건번호다. WebFetch 는 naver 를 막으니 urllib·curl 로 받는다. 2026-08 이전 글 45건은 대리님이 "그냥 두기"로 정했으니 backfill 에 다시 나와도 올리지 않는다.

**C. 대표 지시 처리**

Drive 에서 `ahj_ceo_order_*.json` 을 읽는다. 이미 완료·보류로 답한 지시(같은 폴더의 `_ceo.json` 에 답이 있는 것)는 다시 처리하지 않는다. 새 지시만 처리하고 `ahj_patch_chunk_<날짜>_ceo.json` 으로 `[{op:"set", list:"ceoOrders", match:{id}, fields:{status, reply, repliedAt}}]` 답변을 남긴다.

**D. 근무 기록 (반드시 마지막에, 0건으로 끝나도 한다)**

A·B·C 각각에 대해 아래를 만들어 하나의 배열로 `ahj_patch_chunk_<날짜>_routine.json` 으로 올린다. 기록을 안 남기면 대리님 화면에 "미실행"으로 뜬다.

```
{"op":"push","list":"routineRuns","fields":{
  "id":"rr-YYYYMMDD-<jobkey>", "job":"auctionSync" | "blogVerify" | "ceoOrder",
  "at":"<지금 ISO8601>", "status":"ok" | "hold" | "fail",
  "summary":"<한 줄, 숫자 위주>", "detail":"<무엇을 했는지, 막혔으면 사유>"}}
```

status 는 ok(정상, 0건 처리라도 ok) / hold(조건 때문에 일부러 안 함) / fail(오류로 못 함).

파일을 올린 뒤 Drive 에서 실제로 있는지 확인하고, 끝나면 각 단계 결과(결과 난 것·진행중 확인 건수·취하/변경, 못 한 것과 사유)와 올린 파일명을 한국어로 짧게 알려줘.