# 안효준 대리 업무 대시보드 — 프로젝트 안내 (CLAUDE.md)

> 새 대화가 시작될 때 이 파일을 먼저 읽는다. 여기 적힌 것이 대리님 업무의 기본 맥락과 규칙이다.
> 여기 없는 사실은 지어내지 말고 대리님께 묻는다. 마지막 갱신: 2026-09-11.

## 1. 누구를 위한 작업인가

- 사용자: **안효준 대리** (옆커폰부동산에듀 부동산팀, 대구 수성구 경매 학원). 반말·구어체로 짧게 말한다. 답도 짧고 실무적으로.
- 이 저장소의 정적 사이트(`index.html` 등, `작업-이어하기.md`·`docs/` 참고)는 별개의 작업(경매 매물 사이트)이다. 그 작업을 이어갈 때는 해당 문서를 따른다. 최근 작업의 중심은 저장소 밖의 **claude.ai 아티팩트 2개**다.
  - 안효준 대리 업무 대시보드: https://claude.ai/code/artifact/1c664c41-2532-4073-b32c-ed6274882f33
  - 전국 경매 물건 현황판: https://claude.ai/code/artifact/e6e3bb90-f77b-48af-aa80-3560d882ae4c
- 계정은 개인 Gmail(팀 조직 없음). 외부 연결(Google Drive)이 붙은 아티팩트는 공개 링크 공유가 불가능하다. 대리님이 이미 알고 있다.

## 2. 대리님이 하는 일 (업무 규칙)

- **학원 운영**: 초급반·중급반은 **5주 기수제**. 20기 2026-08-25 개강, 21기 2026-10-12 개강. 기수마다 개강일이 다르므로 학생별 `courseStartDate`를 쓰고, 없으면 신청일로 계산한다.
- **체험단**: 기수마다 블로그 체험단 몇 명이 들어온다. 체험단 = **무료 수강권**(수강료 0원, 결제완료 처리, 메모 "블로그 체험단 · 무료 수강권", DB courses.trial).
- **수업중 인원**: "등록완료"만으로는 부족하다. **실제 입금(금액 > 0)이 확인된 학생만** 수업중으로 센다.
- **2026-08-05 대량 이관 학생 118명**은 과거 데이터다. 절대 수정·삭제·재분류하지 않는다 (코드의 `AUG5_BULK_IMPORT_STUDENT_IDS`).
- **입금 처리**: 우리은행 거래내역 엑셀을 대리님이 보내면 대시보드에 없는 거래만 등록한다. 카드 결제는 카드사 정산(롯데·신한·현대·하나·NH…)으로 수수료가 빠진 금액이 들어온다. 마법사에서 "카드결제"로 등록된 학생이 있으면 대시보드가 정산 입금(수강료의 95~100%, 3주 이내)을 자동으로 연결하고 수강료를 실제 입금액(예: 328,680원)으로 맞춘다. 후보가 둘 이상이면 연결하지 않고 "미확정 입금"으로 남는다. 4대보험 과오납 환급은 `general`, 대리입찰 컨설팅비는 `consulting`.
- **경매 업무**: 현황판에서 물건을 골라 권리분석을 한다. "권리분석보내기" 체크 → 대시보드 데일리 경매분석에 자동 등록(조사중, 분석글 미작성). 매각 결과는 **자동 동기화**한다: 매일 07시 루틴이 **법원경매정보(courtauction.go.kr) 1차 자료**에서 사건별 기일내역을 받아(`scripts/court_auction_fetch.py`) 대시보드와 대조해 유찰(다음 회차로 이동)·매각종료(타인 낙찰가 기록)·변경·취하를 `scripts/auction_results_sync.py`로 판정하고 `ahj_market_chunk_<날짜>_results.json`으로 올린다. 예전에는 현황판 HTML의 회차 기록(ld)을 봤는데, 현황판은 다른 세션이 빌드하는 2차 자료라 결과가 늦게 붙거나 아예 안 붙었다. 법원경매정보는 매각 다음 날이면 결과가 확정돼 있다. 현황판 HTML도 같은 스크립트가 그대로 읽으므로 보조 소스로 남겨둔다. **현황판은 남이 낙찰받은 물건을 status `매각` 으로만 적고 낙찰가는 비워 둔다.** 그래서 이 상태와 `유찰` 도 "결과가 덜 들어온 것"으로 보고 조사중·입찰예정과 함께 매일 다시 조회해, 낙찰가를 채우고 `매각종료` 로 올린다(2026타경33 등 5건이 이 때문에 낙찰가 0원인 채 남아 있었다). `매각` 은 `MARKET_STATUS` 에도 들어 있어야 한다 — 없으면 상태 드롭다운이 이 값을 표현하지 못해 첫 항목(조사중)으로 보이고, 그대로 저장하면 실제 상태가 조용히 뒤집힌다. `selectHtml` 도 목록에 없는 현재 값을 앞에 끼워 넣어 같은 사고를 막는다. 대리님은 직접 입찰한 건만 낙찰/패찰로 바꾼다. 현황판에 결과가 아직 없는 물건만 홈 긴급 목록 "경매 결과 미입력 N건"과 카드 빠른 버튼으로 남는다. 대리님은 이 부분을 손으로 하지 않기를 원한다. 대리입찰 컨설팅도 한다. 경매 물건 블로그 글은 `.claude/skills/naver-auction-blog-writer` 규칙을 따른다.
- **AI 직원 업무 분장**: 루틴으로 돌리는 일은 직원별로 나눠 대시보드 "효제이 AI직원팀 → 업무 분장 · 루틴 상태" 카드에 표시된다. 각 루틴은 끝날 때 `ahj_patch_chunk_..._routine.json` 으로 `{op:"push", list:"routineRuns", fields:{id, job, at, status, summary, detail}}` 를 남겨야 한다. **기록을 안 남기면 대리님 화면에 "미실행"으로 뜬다.**

| job key | 담당 | 주기 |
|---|---|---|
| `auctionSync` | 운영 비서 | 매일 07:00 |
| `blogVerify` | 운영 비서 | 매일 07:00 |
| `ceoOrder` | 운영 비서 | 매일 07:00 |
| `closingReport` | 운영 비서 | 매일 15:48 |
| `analysisCheck` | 운영 비서 | 매일 20:00 |
| `blogPipeline` | 시장조사 담당 | 매일 08:00 |
| `blogFactCheck` | 콘텐츠기획 담당 | 매일 08:00 |
| `blogWrite` | 블로그제작 담당 | 매일 08:00 |
| `blogSeo` | 검수 담당 | 매일 08:00 |
| `blogApprove` | 승인 담당 | 매일 08:00 |
| `carousel` | 이미지구성팀 담당 | 수시 |
| `brandWeekly` | 브랜드전략 담당 | 매주 |

  status 는 `ok`(정상, 0건 처리라도 ok) / `hold`(조건 때문에 일부러 안 함) / `fail`(오류로 못 함). 새 루틴을 만들면 코드의 `ROUTINE_JOBS` 에도 추가한다. 지연·오류가 생기면 홈 "지금 처리할 일"에 "AI 직원 루틴 N건 멈춤"으로 올라온다. 블로그 5단계는 `dependsOn`으로 묶여 있어, 앞 단계가 보류면 뒷 단계는 "미실행"이 아니라 "앞 단계 보류로 대기"로 표시된다.
- **업무마감보고 자동 수집**: 대리님 업무일지는 별도 Drive 폴더 `1ZZysuh-y_E3iEwH8O6h93teygbX_jige`("업무일지 폴더")에 Google 문서로 쌓인다(`업무일지_YYYY-MM-DD_작성자`). 매일 15:40 이후 그날 문서가 올라온다. **원본은 절대 수정·삭제하지 않는다. 읽기만 한다.**
  - 문서 본문은 `## ① 결과물` ~ `## ⑥ 우선업무` 형식이다. 대시보드가 이 6항목을 잘라 `workReports` 에 넣는다(`parseWorkLogText`).
  - 작성 주체는 **파일 이름**으로 가른다 — 제목에 `CODEX`·`GPT`·`최종` 이 있으면 `codex-final`, 아니면 `ai-draft`. **GPT 대화에는 직접 접근할 수 없다.** GPT/Codex 최종본은 파일로 저장된 것만 수집한다.
  - 항목 id 는 `wr-<날짜>-ai` / `wr-<날짜>-codex` / `wr-<날짜>-closing`(15:50 루틴) 으로 갈린다. 같은 id 면 새로 만들지 않고 갱신한다.
  - 문서가 수정되면 다시 읽는다(처리 키 = 파일ID + 수정시각, `state.meta.processedWorkLogDocs`).
  - 화면: 메뉴 `업무일지` → `📋 업무일지 자동 수집` 카드에 마지막 수집 시각·성공/실패·읽은 원본 문서·`🔄 지금 수집` 버튼.
  - **형식 3종을 다 읽는다** — Google 문서 · Markdown(`.md`/`.txt`) · JSON(`.json`). JSON 은 `sections` 키(`deliverables/outcomes/comparison/problems/solutions/priorities`)를 쓴다. 항목 구분은 동그라미 숫자 `①~⑥` 이고, 보통 숫자 `1.` 은 인식하지 않는다.
  - **하루 최대 3종**(원본 `-ai` · GPT 최종본 `-codex` · 마감본 `-closing`)을 각각 보관하되, 화면은 날짜로 묶어 **집계 대상 1장**(마감본 우선)만 강조하고 나머지는 근거자료로 표시한다. 중복 합산하지 않는다. 그날 GPT 최종본이 없으면 **"GPT 업무 미반영"** 경고가 뜬다.
  - **브라우저가 닫혀 있으면 대시보드는 수집하지 않는다.** 그 몫은 15:41~15:50 KST 루틴(`trig_017v14iuXGFcye7ijECz8PZK`)이 대신한다. 루틴은 `startedAt`·`finishedAt` 을 기록하고 화면에 "15:41 시작 → 15:49 완료" 로 표시된다.
- **대표 지시창(ceo.console)**: 대시보드 홈 사무실 지도 아래에 창 3개가 있다 — `ceo.console`(지시 쓰는 곳) · `live.feed`(오늘 직원들이 뭘 했는지) · `staff.roster`(직원별 출근·진행 상태). 대리님이 ceo.console 에 지시를 적으면 Drive 에 `ahj_ceo_order_<id>.json` 이 올라가고, **다음 아침 점검(07시) 루틴이 읽어서 처리한 뒤 답변을 되돌려준다**(`ceoOrders` 의 status 접수→완료/보류 + reply). **대시보드가 이미 아는 것은 보내는 즉시 답한다**(2026-09-15 추가, `ceoInstantAnswer`). 오늘 한 일(routineRuns·블로그·경매·은행·DB 오늘치 집계) · 왜 늦는지(루틴 late/fail/hold + 결과 미입력 + 발행대기 적체) · 발행대기 순서(오래된 순) · 이번 주 KPI 네 가지는 Drive 를 거치지 않고 화면에서 바로 답하고 status 를 완료로 남긴다(`answeredBy:"dashboard"`, 화면에 "즉답" 으로 표시). 밖에 나가 봐야 아는 지시(글 작성·조사 등)만 예전처럼 Drive 에 올라가 **다음 아침 점검(07시) 루틴이 처리**한다(`ceoOrders` 의 status 접수→완료/보류 + reply). 이미 완료·보류로 답한 지시는 다시 처리하지 않는다.
- **KPI**: 매주 팀 KPI 양식에 입력한다. 대시보드 홈 "주간 KPI 입력표"가 같은 기준으로 계산한다.
- **블로그 게시**: 네이버에 올린 뒤 대시보드 카드의 "네이버에 올렸어요 → 발행 완료" 버튼을 누르면 발행완료가 되고 글 주소를 붙여넣을 수 있다. 아침 루틴은 발행대기 20건 이상이면 새 글을 만들지 않고, 10~19건이면 1건, 그 아래면 1~2건만 만든다.
- **우리 블로그는 셋이다.** 발행 확인(`-verify` 청크)에서 아래 셋은 모두 "발행완료"로 채택한다. 예전에는 공식블로그만 인정해서, 대표님 블로그에 올라간 글이 계속 발행대기로 남아 적체를 키웠다.
  - `ykphone_edu` — 공식블로그. **권리분석 물건 분석글을 올리는 곳이다.**
  - `hjko0` — 대표님 블로그. 학원 모집·정보성 글 위주.
  - `gkgk0307_` — 서브블로그. 비중이 낮으니 여기 글이 안 잡혀도 따로 파고들지 않는다.
  주소 형태가 `blog.naver.com/<id>` · `m.blog.naver.com/<id>` · `PostList.naver?blogId=<id>` 로 제각각이라 전체 URL 이 아니라 **블로그 아이디**로 비교한다(`scripts/blog_publish_match.py` 의 `OUR_BLOG_IDS`).
- **발행 확인은 검색이 아니라 RSS 로 한다** (2026-09-14 변경). 네이버 검색 API 는 블로그 주인으로 거르지 못하고 검색어로만 찾는다. 그래서 본문에 브랜드명이 없는 글은 아무리 검색해도 안 걸렸고, 그 구멍으로 **공식블로그 글 90여 건이 대시보드 집계에서 통째로 빠져 있었다**(9/7~9/11 권리분석 글 13건 포함). 아침 루틴은 매일 "매칭 0건"만 보고하고 있었다.
  `https://rss.blog.naver.com/<블로그id>.xml` 은 검색어 없이 그 블로그의 **최근 50건**을 게시일까지 정확히 준다. WebFetch 는 naver 를 막지만 urllib·curl 로는 받아진다.
  - `scripts/blog_rss_fetch.py naver_results.json` — 우리 블로그 3곳 RSS 를 받아 `search_blog` 와 같은 모양({title,description,link,bloggerlink,postdate})으로 만든다. 한두 곳이 실패해도 나머지로 진행하고, 전부 실패하면 종료코드 1.
  - `scripts/blog_publish_match.py snapshot.json naver_results.json verify_chunk.json backfill_chunk.json` — 두 가지를 낸다. **verify** = 대시보드에 있는데 url 이 비어 있던 글을 발행완료+주소로 채움. **backfill** = 블로그에는 있는데 대시보드에 아예 없는 글을 blogPosts 에 새로 등록(`ahj_patch_chunk_..._blogbackfill.json`, url 을 키로 upsert 라 중복되지 않음). 같은 사건번호로 우리 글이 둘 이상이면 자동 채택하지 않고 ambiguous 로 뺀다.
  - 한계: RSS 는 최근 50건까지만 준다. 더 오래된 글을 찾아야 할 때만 `search_blog` 로 사건번호를 따로 검색한다.
  - `gkgk0307_` 는 전체 글이 2건(최신 2026-07-06)뿐인 사실상 휴면 블로그다. 그냥 두면 된다.
- **매칭 키는 제목이 아니라 사건번호다.** 대리님이 올릴 때 제목을 다시 쓰는 경우가 많아 대시보드 제목과 실제 게시 제목이 다르다. 권리분석 물건 분석글에는 사건번호가 거의 항상 들어가므로 사건번호(`20\d\d타경\d+`)를 1순위 키로 쓴다.
  사건번호가 없는 정보성 글(뉴스·팁)은 사건번호로는 못 맞추지만, RSS 로 바꾼 뒤로는 **url 기준 backfill** 로 등록되므로 게시 사실 자체는 빠지지 않는다.

## 3. KPI 계산 기준 (팀 양식의 8월 기준값과 대조해 확정)

| KPI | 기준 |
|---|---|
| 에듀 블로그 콘텐츠 발행 | 파이프라인이 만든 글 수(모든 상태). 실제 네이버 게시 수는 참고로만 |
| 에듀 수강생 매출 | 은행 **입금 합계** |
| 에듀 순이익 | 입금 − 출금 |
| 에듀 신규 수강생 문의 | 수강생 DB 신규 등록 수 |
| 에듀 유료 수강생 등록 | 수강료(tuition) 입금 건수 |
| 에듀 체험단 운영 | DB 체험단 등록 수 |
| 경매 권리분석 완료 | 대리님이 보고한 날짜별 건수(자동 집계 불가) |

주는 월~일. 주간 목표 기본값: 블로그 7 / 매출 740,000 / 순이익 200,000 / 문의 6 / 유료 2 / 체험단 1 (월 목표는 ×5 수준). 대시보드에서 수정 가능.

## 4. 기술 구조 (대시보드)

- 단일 HTML 아티팩트. 데이터는 브라우저 localStorage(`ahj_realestate_dashboard_v1`) + Google Drive 백업.
- Drive 폴더 "안효준 대시보드 백업" id `1ZkIT6DPRGBg8DYu9ezNTEjo6ekUJMvZ4`. 스냅샷 `ahj_dashboard_snapshot.json`(최신 파일이 현재 상태, 약 900KB).
- **나(Claude)는 대시보드 데이터를 직접 못 고친다.** 폴더에 작은 청크 JSON을 올리면 대시보드가 열릴 때 자동 병합한다. 스냅샷 전체를 수정·재업로드하지 않는다.

| 청크 접두사 | 용도 · 형식 |
|---|---|
| `ahj_bank_addition_chunk_` | 은행 거래 추가 `[{sig,date,description,deposit,withdrawal,balance,studentId,category,installmentId,expenseCategory?}]`, sig = `날짜|적요|입금|출금|잔액`, sig 중복은 건너뜀 |
| `ahj_bank_category_patch_chunk_` | `[{sig, category}]` 비어 있을 때만 채움 |
| `ahj_student_add_chunk_` | 수강생·매출 명단에 학생 추가 `[{student:{…}, dbPatch?, txSig?}]` (마법사 없이 원격 등록) |
| `ahj_student_tuition_patch_chunk_` | `[{studentId, tuition}]` tuition 0일 때만 |
| `ahj_revenue_reconfirm_chunk_` | `[{kind:"student", studentId, txSig}]` 결제완료 + 입금일·카드 표시 |
| `ahj_course_start_patch_chunk_` | `[{studentId, courseStartDate}]` 덮어씀 |
| `ahj_market_chunk_` | 데일리 경매분석 upsert. **사건번호+물건번호로 맞춘다**(`marketCaseKey`) — 현황판은 `2026타경33 물건1` 처럼 꼬리를 붙여 보내고 손으로 만든 카드에는 꼬리가 없어서, 글자로만 맞추던 예전에는 같은 사건이 카드 두 장으로 갈라졌다(7건). 꼬리가 없으면 물건1로 본다. 얹을 때 `applyMarketChunkFields` 규칙: 메모는 덮어쓰지 않고 합치고, 0·빈 값으로 기존 값을 지우지 않으며(현황판은 낙찰가를 0으로 보낸다), 확정 상태(매각종료·낙찰·패찰·취하)를 중간 상태로 되돌리지 않고, `analysisWritten` 은 켜기만 한다. `caseNumber`·`id` 는 기존 표기를 지킨다 |
| `ahj_kpi_log_chunk_` | `[{key:"analysis", date, count}]` 권리분석 건수 |
| `ahj_patch_chunk_` | **범용 패치** `[{op:"set"|"push"|"delete", list, match, fields, upsert?, allowBulk?}]` — 허용 목록의 아무 항목이나 수정·추가·삭제. 새 종류의 데이터 변경은 이걸 먼저 쓴다(재발행 불필요). 118명 이관 학생은 allowBulk 없이는 건드리지 않음 |
| `ahj_ceo_order_` | **대표 지시** — 대시보드가 올림 `{id,at,text}` (파일 1건 = 지시 1건). 아침 루틴이 읽어서 처리하고 `ahj_patch_chunk_..._ceo.json` 으로 `{op:"set", list:"ceoOrders", match:{id}, fields:{status,reply,repliedAt}}` 답변을 남긴다 |
| `ahj_blog_chunk_` | 블로그 파이프라인 결과 `{runAt,status,addedCount,note,items:[…]}` / `-verify` 파일은 `[{id,status,url,publishedAt}]` |

- 청크 파일명은 UTC 날짜. 같은 이름 파일이 있어도 id로 구분해 각각 한 번씩 처리된다.
- 위 표에 없는 변경은 `ahj_patch_chunk_`로 처리한다. 정말 새 병합 로직이 필요할 때만 merge 함수를 추가하고 재발행한다(`mergeXxxChunksIfNeeded` 패턴, init·setInterval·visibilitychange 세 곳에 배선).
- 데이터 변경 작업의 마무리 규칙: 파일을 올린 뒤 Drive에서 파일이 있는지 확인하고, 답변에 파일명을 적는다.

## 5. 발행·검증 절차

- 작업 파일(세션 스크래치): `app_script_clean.js`(대시보드 JS 전체) → `dashboard_publish.html`의 두 번째 `<script>` 블록에 통째로 삽입 → `node --check` → Playwright(`NODE_PATH=/opt/node22/lib/node_modules`, 크로미움 `/opt/pw-browsers/chromium`, `window.claude.mcp.callTool` 모킹, localStorage 시드 후 reload) → `Artifact` 도구로 `url` 지정 재발행. 스크래치 디렉터리는 세션마다 새로 생기므로, 새 세션에서는 `Artifact action:"read"`로 현재 발행본을 받아 그 위에서 수정한다.
- 대시보드는 런타임 0.1.15(`window.claude.mcp` 직접 사용). 현황판은 0.2.41(`await claude.use("mcp")`). 두 방식이 다르니 섞지 말 것.
- **현황판은 다른 세션(데이터 빌드)이 자기 원본에서 재발행한다.** 내가 배포본에 직접 넣은 코드는 그 세션이 원본으로 옮겨 주지 않으면 다음 빌드에서 사라질 수 있다. 현황판을 고치면 대리님께 "현황판 빌드 세션에도 반영해 달라"고 알려야 한다. 재발행 전에는 반드시 `Artifact action:"read"`로 최신 배포본을 받아 그 위에 얹는다.
- 발행 후 아티팩트 watch 등록은 이 환경에서 항상 실패한다(403). 구독 중이라고 말하지 않는다.
- 모바일 확인은 뷰포트 meta가 붙은 미리보기 사본으로 한다(로컬 파일에는 없음).

## 6. 자동 루틴 (Claude_Code_Remote 트리거, UTC)

- `trig_01BvA6VTCjaQVkN93pbwgDgM` 22:06 UTC(07시 KST) — 아침 점검 4단계. A. 경매 결과 자동 동기화 — `scripts/court_auction_fetch.py` 로 법원경매정보에서 기일내역을 받고 `scripts/auction_results_sync.py` 로 대조해 `ahj_market_chunk_<날짜>_results.json` 업로드. **스냅샷만 보면 안 된다** — 스냅샷은 대시보드를 열어야 Drive 에 올라가는데 며칠씩 안 열리는 일이 잦다(2026-09-15 기준 최신 스냅샷이 9/11). 그 사이 현황판이 보낸 새 물건은 스냅샷에 없어 통째로 빠진다(2025타경9339 가 9/12 등록 → 9/14 매각기일이 지나도록 방치됐다). 그래서 스냅샷보다 나중에 올라온 `ahj_market_chunk_*.json` 을 모두 받아 `--chunks` 로 함께 넘긴다(caseNumber 기준 upsert 로 합쳐진다). B. 네이버 블로그 발행 확인 — `scripts/blog_rss_fetch.py` 로 우리 블로그 3곳 RSS 를 받아 `scripts/blog_publish_match.py` 로 대조, `-verify` 청크(주소 채우기)와 `_blogbackfill` 청크(대시보드에 없던 글 등록)를 각각 업로드. C. 대표 지시 처리 — `ahj_ceo_order_*.json` 을 읽어 처리하고 `ahj_patch_chunk_..._ceo.json` 으로 `ceoOrders` 에 status·reply 를 되돌려준다. D. 세 가지 각각 `routineRuns` 기록(`ahj_patch_chunk_..._routine.json`).
- `trig_017v14iuXGFcye7ijECz8PZK` 06:41 UTC(15:41 KST, **마감 15:50**): 업무마감보고 작성. `startedAt`·`finishedAt` 를 `routineRuns` 에 기록한다. 15:48까지 못 끝내면 축약해서라도 올린다. 업무일지 폴더(`1ZZysuh-...`)의 오늘 문서를 **읽기만** 해서 ①~⑥ 양식으로 정리하고 `ahj_patch_chunk_<날짜>_closing.json`(`workReports`, id `wr-<날짜>-closing`)으로 올린다. 각 건에 완료/진행/예정을 붙이고 **수치는 추정하지 않는다**(근거 없으면 "집계 예정"·"비교 자료 미확보"). 오늘 문서가 없으면 `hold` 로 기록하고 끝낸다.
- `trig_012sR8svRraK3bQQ7vksLjud` 11:00 UTC(20시 KST): 권리분석 체크 자동 반영. `scripts/blog_rss_fetch.py` + `scripts/market_analysis_check.py` 로 블로그에 올라간 권리분석 글과 `marketAuctions` 를 **사건번호로** 맞춰 `analysisWritten` 을 켠다(`ahj_patch_chunk_<날짜>_analysis.json`). **켜기만 하고 이미 켜진 것을 끄지 않는다** — 대리님이 직접 끈 것을 되돌리면 안 되기 때문이다. 사건번호가 정확히 같을 때만 켜고, 글이 아직 없는 물건은 목록으로만 보고한다. `caseNumber` 에 `2025타경1245 물건1` 처럼 꼬리가 붙은 항목이 있어 통째로 비교하면 안 맞는다(사건번호만 뽑아 비교).
- `trig_017apcdF32gc1UkJcRUGoU2f` 23:03 UTC(08시 KST): 블로그 제작 파이프라인(아이디어→정보검수→작성→SEO검수→최종검토). 각 단계의 상세 규칙은 `.claude/skills/blog-idea-scout`, `blog-fact-checker`, `blog-writer`, `blog-seo-editor`, `blog-final-reviewer` 스킬을 따른다(경매 물건 글은 `naver-auction-blog-writer`, 인스타 캐러셀은 `image-carousel-designer`, 경쟁사 분석은 `brand-strategy-analyst`). 요약 규칙: 메타디스크립션 첫 줄 필수, 본문 1,500자 이상, 질문형 소제목 2개 이상, 핵심정리·FAQ·해시태그 5개 이상, "무조건/확실한 수익" 금지, 출처 원문 대조 필수, 최근 7일 소재와 60% 이상 달라야 함. 소재 없으면 0건으로 기록.
- **법원경매정보 API 메모** (2026-09-15 확인). WebSquare 앱이라 화면은 못 긁지만 뒤에 붙은 JSON API 는 로그인 없이 열린다. 전부 POST, `Content-Type: application/json`, 헤더에 `SC-Pgmid` 를 넣는다. 프록시가 간헐적으로 연결을 끊으니 **재시도는 필수**(`court_auction_fetch.py` 가 5회 재시도한다).
  - 법원 목록 `POST /pgj/scframe/lib/sccort/list.on` `{}` → `data.scortList` (대구지법 `B000310`, 대구지법 서부지원 `B000320`). 대시보드 `court` 가 "대구서부지원 2계"처럼 제각각이라 계 번호를 떼고 맞춘다.
  - 회차별 기일내역 `POST /pgj/pgj15A/selectCsDtlDxdyDts.on` `{"dma_srchDxdyDtsLst":{"cortOfcCd","csNo"}}` → `data.dlt_dxdyDtsLst` 에 `{dxdyTime, auctnDxdyKndNm, tsLwsDspslPrc, dxdyRslt}`. `dxdyRslt` 가 "유찰"·"변경"·"매각<br />(88,999,999원)" 처럼 **사람이 읽는 글자로 그대로 온다**. 매각기일만 쓰고 매각결정기일·대금지급기한·배당기일은 버린다.
  - 사건기본정보 `POST /pgj/pgj15A/selectAuctnCsSrchRslt.on` `{"dma_srchCsDtlInf":{"cortOfcCd","csNo"}}` → `data.dma_csBasInf` 의 `ultmtDvsCd`(204 취하·205 취소·107 기각·108 각하·000 미종국)로 **취하 판정**. 기일내역에는 취하가 안 나온다.
  - 코드표 `POST /pgj/scframe/lib/sccd/list.on` `{"intgGrpCdLst":"PGJ-AUCTN_DXDY_RSLT_CD&ULTMT_DVS_CD"}`.
  - `csNo` = 연도(4) + 사건부호(타경=`0130`) + 일련번호 6자리 zero-pad. `2025타경1245 물건1` → `20250130001245` + 물건번호 1(응답의 `dspslGdsSeq` 로 거른다).
- 도구 제약: WebFetch가 naver·chosun 도메인을 막는다(블로그 RSS 는 urllib·curl 로 우회한다). casenote.kr는 가끔 503(law.go.kr 대체). PlayMCP 세션이 자주 만료되니 ToolSearch로 다시 로드한다.

## 7. 최근 상태 메모 (2026-09-08)

- 21기 초급반 신규: 전다원(9/2 입금 330,000). 20기: 조은성·백진욱·정홍식·배주경·김옥란·최서하(9/3 카드 328,680)·노혜영·김유진.
- 김종익 150,000(9/4) = 대리입찰 컨설팅비.
- 권리분석 보고: 9/2 1건, 9/4 2건, 9/7 1건, 9/8 3건.
- 은행 거래는 2026-09-04까지 등록됨. 다음 엑셀이 오면 그 이후만 추가.
