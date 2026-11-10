# 아침 점검: PC 수집 경매 결과 반영(사이트 조회 없음) + 블로그 발행 확인 + 대표 지시 처리 (매일 07시 KST) — cron `6 22 * * *`

아침 점검 시간입니다 (07시 KST). CLAUDE.md 6절의 이 루틴 설명을 먼저 읽고, 아래 A~D를 순서대로 처리해줘. 각 단계는 실패해도 다음 단계를 계속 진행한다.

공통: Drive 백업 폴더 parentId = 1ZkIT6DPRGBg8DYu9ezNTEjo6ekUJMvZ4. 스냅샷 전체(ahj_dashboard_snapshot.json / .json.gz)는 절대 수정·재업로드하지 않는다. 학생 이름·연락처·계좌 같은 민감정보는 보고서 본문에 넣지 않는다. 경매 자료의 소유자·채무자·임차인·채권자·낙찰자 등 사람 이름은 모두 OO 로 쓰고 이름 필드를 만들지 않는다. 도구가 "세션 만료"로 실패하면 ToolSearch로 다시 로드해 한 번 더 시도한다. 컨테이너가 재시작돼 저장소에 `scripts/` 가 없으면 `git fetch origin claude/dashboard-from-yesterday-p4zuaj && git checkout -B claude/dashboard-from-yesterday-p4zuaj origin/claude/dashboard-from-yesterday-p4zuaj` 로 먼저 복구한다. 저장소 커밋은 하지 않는다.

**A. 경매 상태 반영 — PC 수집 결과 검토·반영 (2026-10-07 대리님 지시로 변경. 사이트 조회 없음)**

금지: `scripts/court_auction_fetch.py` 실행, 법원경매정보(courtauction.go.kr) 접속·JSON 엔드포인트 호출, 탱크옥션 접속. 법원 확인은 PC 쪽 GPT(로그인된 Chrome, 매일 05시)가 화면으로 하고 Drive 에 JSON 으로 저장한다. 이 루틴은 그 파일을 검토·반영만 한다. 파일에 없는 물건의 법원 확인을 대신하지 않고 "오늘 미확인"으로 남긴다. 데이터가 전달됐다고 검증 완료가 되는 것이 아니다 — 파일 안의 법원 확인 표시(verified·checked_at·법원 원문)가 있는 물건만 "확인됨"으로 본다.

1. 스냅샷을 **정확한 제목으로** 검색한다: `(title = 'ahj_dashboard_snapshot.json.gz' or title = 'ahj_dashboard_snapshot.json') and parentId = '1ZkIT6DPRGBg8DYu9ezNTEjo6ekUJMvZ4'` → modifiedTime 최신 파일. `title contains` 금지(이름 바꾼 옛 파일이 최신으로 잡힌다). gzip(바이트 `1f 8b`)이면 풀어서 `snapshot.json` 으로 저장(`import gzip,base64,json; raw=base64.b64decode(content); raw=gzip.decompress(raw) if raw[:2]==b'\x1f\x8b' else raw`). 수십~수백 KB 짜리 평문은 빈 부분 스냅샷이니 쓰지 않는다. 스냅샷보다 나중에 올라온 `ahj_market_chunk_*.json` 도 전부 받아 caseNumber(사건번호+물건번호, `marketCaseKey` 규칙) 기준으로 얹어 "현재 카드 상태"를 만든다(`scripts/court_auction_fetch.py` 의 `apply_market_chunks` 함수만 import 해서 써도 된다 — 네트워크 호출 없음).
2. PC 수집 파일을 찾는다: 폴더 전체에서 `title contains 'court_pc_'` 로 검색해 **오늘(KST) 날짜가 제목에 든 파일** 중 modifiedTime 최신 것 1개(같은 제목이 여럿이면 가장 큰 것·최신 것). 없으면 A 는 `hold` 로 기록("PC 수집 파일 없음 — 기존 카드 전부 오늘 미확인")하고 3~6 을 건너뛴다. 파일은 base64 디코드 후 새 빈 디렉터리에 저장하고 `python3 -I` 로만 읽는다. 상위 메타(`page_budget`·`security`·`coverage`·`limitations`)를 먼저 읽어 보안문자·차단·로그인 해제가 있었으면 보고에 "막힘(사이트명)·원인" 으로 적는다.
3. 물건 식별은 법원·사건번호·물건번호다. 사건번호는 `2024-124042` 형식이 와도 `2024타경124042` 로 바꿔 대시보드 카드와 맞춘다(물건번호 2 이상만 ` 물건N` 꼬리). 각 물건의 법원 확인 블록(`court_check` / `court` / `court_detail` 등 이름이 달라도 "법원경매정보에서 직접 확인" 표시와 확인일·법원 원문 상태·기일내역·물건비고 원문이 있는 것)을 읽는다. 블록이 없거나 `verified` 가 참이 아니면 그 물건은 **법원 미확인**이다. 탱크 상세·탱크 첨부 법원문서(`detail_status: verified`, `remarks_checked`, `full_history_collected`)는 법원 원본 확인이 아니다.
4. **기존 카드 갱신** — 대시보드 카드 중 파일에서 법원 확인된 것만. 신규 등록 기준을 벗어난 기존 카드도 지우지 않고 상태 갱신을 이어 간다. 탱크만 확인된 물건은 courtCheckedAt 을 갱신하지 않고 memo 에 "탱크 확인 M/D" 로만 적는다(출처 구분). 확인 실패는 "오늘 미확인". 이전 값(status·saleDate·minSalePrice·failCount·courtResult)과 법원 원문을 비교해 실제 차이가 있을 때만 변경으로 기록한다. 대시보드 status 로의 대응: 유찰→`유찰`(failCount 는 법원 기일내역의 유찰 횟수, 다음 기일·최저가는 법원에 공고된 것만, 없으면 적지 않는다) / 타인 매각→`매각종료`(winningBid 법원 매각금액, 낙찰자 이름 없음) / 취하·취소·기각·각하·종결→`취하`(courtResult 에 원문 구분을 남긴다) / 변경·연기·정지→`변경`(새 기일 미공고면 courtResult 에 "새 기일 미정", 기존 기일을 유효한 입찰일로 쓰지 않는다) / 매각불허가·허가취소·대금미납·재매각→status 는 유지하고 courtResult 맨 앞에 "⚠ 재확인:" 을 붙여 주의 이슈로 표시 / 진행중→"진행중 · 매각기일 M/D 최저 X원". "매각" 확인을 매각허가·대금납부·종결로 올리지 않는다. 낙찰·패찰 카드는 건드리지 않는다. 각 행은 `{caseNumber, status?, failCount?, saleDate?, minSalePrice?, winningBid?, courtResult:"<법원 원문 상태> · <요약>", courtStatusRaw:"<법원 화면 원문>", courtCheckedAt:"<PC 확인일 YYYY-MM-DD>", courtCheckedBy:"PC GPT 화면 확인", courtSourceUrl, updatedAt}` 로 만들어 `ahj_market_chunk_<오늘날짜>_pcresults.json` 으로 올린다(0건이면 올리지 않는다). 변경 이력은 `ahj_court_changelog_<오늘날짜>.json` 에 `[{caseNumber, field, before, after, checkedAt, source, reason}]` 로 함께 올린다(대시보드는 이 접두사를 읽지 않지만 기록으로 남긴다). 파일에 없는 카드는 아무것도 올리지 않는다 — 마지막 확인값·확인일이 그대로 남아 카드에 "법원 확인 <옛 날짜>" 로 보이는 것이 "오늘 미확인" 표시다. 그 목록을 보고에 적는다.
5. **신규 등록** — 아래를 전부 충족하는 물건만 `ahj_market_chunk_<오늘날짜>_pcnew.json` 으로 올린다. 하나라도 미확인이면 등록하지 않는다. ① 아파트, 법원 원문이 진행중이고 종국결과 없음 ② 법원 물건비고를 PC 가 직접 읽음(실제 공란 "" 과 미확인 null 을 구분, null 이면 탈락) ③ 비고·매각조건에 유치권·법정지상권·지분·대항력·선순위·재매각·별도등기·분묘·예고등기·농지취득·맹지·위반건축물·가처분·특별매각조건·매각불허가·우선매수·전세권·대지권미등기 표현이 없음(예외: 대항력만 있고 법원 비고에 대항력 포기 확약 또는 대항력 없음이 명시된 경우, why 에 근거) ④ 탱크 상세에서 매수인 인수 없음이 명시됨(인수 있음·인수액·미확인은 탈락) ⑤ 유찰 1회 이하이고 최저가 ≥ 감정가 70% ⑥ 매각기일이 오늘부터 45일 안(v88, 2026-10-08 대리님 지시 — 15~30일·31~45일 남은 물건도 등록, 법원 검색 화면의 조회 기간은 등록 기간 제한이 아니다). 대구·경산·칠곡은 확인일 기준 매각기일까지 10일 이상, 면적 제한 없음(95㎡ 초과도 등록) / 그 밖의 지역은 ⭐대장 단지(근거 있음)이고 전용 95㎡ 이하이며 기일 미경과 ⑦ 필수 자료 누락·자료 충돌 없음 ⑧ `check.ok` 는 오늘 PC 확인으로 다시 판정한 값만 쓴다 — 어제 이전 `check.ok=true` 를 그대로 믿지 않는다(대시보드 v88 도 `check.checkedAt` 이 7일 넘으면 검증대기로 돌린다). 권리분석 글 작성 여부(analysisWritten)는 등록 판정과 무관하다. 행 형식은 현황판 청크와 같다: `{date, caseNumber, court, region, propertyType:"아파트", buildingName(원본 단지명 그대로 — ⭐를 이름에 붙이지 않는다), isStar:true|false|null, starBasis:"<⭐ 근거>", address, exclusiveArea, appraisalValue, minSalePrice, saleDate, failCount, status:"조사중", winningBid:0, analysisWritten:false, memo:"PC 수집·법원 확인 M/D · 선별 기준 충족 · 비고 <공란|요약> · 탱크 인수 없음", sp:[], spNote, check:{ok:true, why, checkedAt:"<PC 확인일 YYYY-MM-DD>", tankInherit:"없음"}, tankViews:<탱크 화면에서 실제 확인한 조회수 숫자, 미확인이면 null>, tankViewsType:"누적"|"당일", tankViewsAt:"<조회수 확인일>", courtStatusRaw, courtResult, courtCheckedAt, courtSourceUrl, tankUrl, source:"PC 수집(법원경매정보 화면 확인)", updatedAt}`. 대시보드 v88 은 이 줄을 받아도 `check.ok===true`·확인일 7일 안·45일 안·유찰 1회 이하·70% 이상·대구권 10일 이상(그 밖은 ⭐+95㎡ 이하)을 다시 판정해 통과한 것만 카드로 만들고, 나머지는 "검증대기"에 둔다. 조회수는 같은 종류끼리만 비교하고 미확인은 null 로 둔다(0 으로 적지 않는다). 조회수가 높거나 ⭐라는 이유로 권리 기준을 완화하지 않는다. memo 에 "자동 등록" 이라는 글자를 쓰지 않는다. 사람 이름을 넣지 않는다. "권리상 문제없음·안전" 대신 "선별 기준 충족" 이라고 쓴다. 법원 미확인(tankOnly) 물건과 저장소 `data/court_pc/tank_index_*.json` 의 이전 색인 자료는 절대 등록하지 않는다.
6. **다음 PC 수집 우선 확인 목록** — `ahj_court_pending_<오늘날짜>.json` 으로 올린다: ① 기존 카드 중 매각기일이 지났는데 결과 미확인 ② 오늘 기일이거나 변경·정지·재매각 등 미해결 이슈 ③ 파일·대시보드 검증대기(`state.meta.pendingMarketAdds`)에서 법원 미확인으로 남은 ⭐ 후보 — 대구·경산·칠곡 ⭐ 먼저, 그 다음 추가 지역 ⭐ ④ 그 밖의 대구권 우선 후보(매각기일 45일 안·최저가 70% 이상·유찰 1회 이하, 탱크 목록 특이표기 없음) ⑤ 나머지 기존 진행 카드. 같은 priority 안에서는 탱크에서 실제 확인된 조회수(같은 종류끼리)가 높은 순, 조회수 미확인(null)은 확인된 것 뒤. 각 행 `{priority, caseNumber, court, buildingName, isStar, saleDate, tankViews, tankViewsType, tankViewsAt, reason}`. 이 목록은 PC 쪽이 다음 날 먼저 볼 수 있게 하는 용도다.

**B. 네이버 블로그 발행 확인 (RSS + 모바일 목록)**

`python3 scripts/blog_rss_fetch.py naver_results.json` 로 우리 블로그 3곳(ykphone_edu · hjko0 · gkgk0307_) RSS 와 모바일 글 목록을 받고, `python3 scripts/blog_publish_match.py <snapshot> naver_results.json verify_chunk.json backfill_chunk.json` 으로 대조한다. 각각 비어 있지 않을 때만 `ahj_blog_chunk_<날짜>-verify.json`(발행완료+주소 채우기)과 `ahj_patch_chunk_<날짜>_blogbackfill.json`(대시보드에 없던 글 등록)으로 올린다. 매칭 키는 제목이 아니라 사건번호다. WebFetch 는 naver 를 막으니 urllib·curl 로 받는다. 2026-08 이전 글과 `[공유]` 글은 스크립트가 backfill 에서 거른다(대리님 "그냥 두기" 결정). rhghwjd00 은 공식블로그(ykphone_edu)의 계정 id 다.

**B-2. 블로그 검색 순위 확인 (NAVER API HUB, 2026-09-28 추가)**

1. Drive 백업 폴더에서 `title = 'ahj_config_naver_apihub.json'` 을 받아(`download_file_content` → base64 디코드) `keyId`·`key` 를 읽는다. 값을 화면·파일·기록에 절대 찍지 않는다. 파일이 없으면 이 단계는 건너뛰고 D 의 blogVerify detail 에 "순위 확인 건너뜀(키 파일 없음)" 을 적는다.
2. 오늘 B 에서 verify 청크를 올렸다면 스냅샷 blogPosts 에 verify 결과(status·url·publishedAt)를 덧씌운 임시 파일을 만들어 쓴다.
3. `NAVER_APIHUB_KEY_ID=<keyId> NAVER_APIHUB_KEY=<key> python3 scripts/blog_rank_check.py <snapshot 또는 임시파일> rank_patch.json` — 발행완료 · 최근 60일 게시 · 최대 40건 · 자동 키워드로 API HUB 블로그 검색 유사도순 100건에서 우리 글 위치를 잰다.
4. `rank_patch.json` 이 비어 있지 않으면 `ahj_patch_chunk_<날짜>_blogrank.json` 으로 올린다. 401 이면 올리지 않고 D 에 사유를 적는다.
5. 이 측정값은 "API 유사도순 100위 안 여부" 다. 보고에서 "API 기준" 을 붙인다. 100위 안에 든 글이 있으면 제목·순위를 보고에 적는다.

**C. 대표 지시 처리**

Drive 에서 `ahj_ceo_order_*.json` 을 읽는다. 이미 완료·보류로 답한 지시(같은 폴더의 `_ceo.json` 에 답이 있는 것)는 다시 처리하지 않는다. 새 지시만 처리하고 `ahj_patch_chunk_<날짜>_ceo.json` 으로 `[{op:"set", list:"ceoOrders", match:{id}, fields:{status, reply, repliedAt}}]` 답변을 남긴다.

**D. 근무 기록 (반드시 마지막에, 0건으로 끝나도 한다)**

A·B·C 각각에 대해 아래를 만들어 하나의 배열로 `ahj_patch_chunk_<날짜>_routine.json` 으로 올린다. B-2 의 결과는 blogVerify 의 summary 끝에 "· API 순위 확인 N건(100위 안 M건)" 으로 붙인다. A 의 summary 는 "PC 결과 N건 검토 · 기존 갱신 M · 신규 등록 K · 오늘 미확인 X · 보류 Y" 형식, PC 파일이 없으면 status `hold`. 기록을 안 남기면 대리님 화면에 "미실행"으로 뜬다.

```
{"op":"push","list":"routineRuns","fields":{
  "id":"rr-YYYYMMDD-<jobkey>", "job":"auctionSync" | "blogVerify" | "ceoOrder",
  "at":"<지금 ISO8601>", "status":"ok" | "hold" | "fail",
  "summary":"<한 줄, 숫자 위주>", "detail":"<무엇을 했는지, 막혔으면 사유>"}}
```

파일을 올린 뒤 Drive 에서 실제로 있는지 확인하고, 끝나면 대리님 보고 양식으로 짧게 알려줘: 1) 신규 발견 수(대구권/그 외/탱크에서만) 2) 법원 원본 검증 완료/미확인·보류 수 3) 신규 등록/기존 갱신/현재 적합 후보 수 4) 실제 발생한 상태 변동(한 줄씩: 단지명 동호 / 사건번호·물건번호 / 이전→현재 / 기일·금액 변화 / 대시보드 처리 / 출처) 5) ⭐ 목록 6) 적합 후보(check.ok=true) 7) PC 파일에 적힌 사이트별 조회수·차단 여부 8) 한도·파일 부재로 확인 못 한 범위와 "오늘 미확인" 카드 목록. 신규 등록이 없으면 "신규 등록 0건", 확인한 범위에서 변동이 없으면 "확인 범위 내 상태 변동 없음" 이라고 쓰고, 미조회 물건까지 변동 없다고 말하지 않는다. 올린 파일명을 적는다.
