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
- **경매 업무**: 현황판에서 물건을 골라 권리분석을 한다. "권리분석보내기" 체크 → 대시보드 데일리 경매분석에 자동 등록(조사중, 분석글 미작성). 매각 결과는 **자동 동기화**한다: 매일 07시 루틴이 현황판 HTML의 회차 기록(ld)과 대시보드를 대조해 유찰(다음 회차로 이동)·매각종료(타인 낙찰가 기록)·변경·취하를 `scripts/auction_results_sync.py`로 판정하고 `ahj_market_chunk_<날짜>_results.json`으로 올린다. 대리님은 직접 입찰한 건만 낙찰/패찰로 바꾼다. 현황판에 결과가 아직 없는 물건만 홈 긴급 목록 "경매 결과 미입력 N건"과 카드 빠른 버튼으로 남는다. 대리님은 이 부분을 손으로 하지 않기를 원한다. 대리입찰 컨설팅도 한다. 경매 물건 블로그 글은 `.claude/skills/naver-auction-blog-writer` 규칙을 따른다.
- **AI 직원 업무 분장**: 루틴으로 돌리는 일은 직원별로 나눠 대시보드 "효제이 AI직원팀 → 업무 분장 · 루틴 상태" 카드에 표시된다. 각 루틴은 끝날 때 `ahj_patch_chunk_..._routine.json` 으로 `{op:"push", list:"routineRuns", fields:{id, job, at, status, summary, detail}}` 를 남겨야 한다. **기록을 안 남기면 대리님 화면에 "미실행"으로 뜬다.**

| job key | 담당 | 주기 |
|---|---|---|
| `auctionSync` | 운영 비서 | 매일 07:00 |
| `blogVerify` | 운영 비서 | 매일 07:00 |
| `ceoOrder` | 운영 비서 | 매일 07:00 |
| `closingReport` | 운영 비서 | 매일 15:50 |
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
  - **브라우저가 닫혀 있으면 대시보드는 수집하지 않는다.** 그 몫은 15:50 KST 루틴(`trig_017v14iuXGFcye7ijECz8PZK`)이 대신한다.
- **대표 지시창(ceo.console)**: 대시보드 홈 사무실 지도 아래에 창 3개가 있다 — `ceo.console`(지시 쓰는 곳) · `live.feed`(오늘 직원들이 뭘 했는지) · `staff.roster`(직원별 출근·진행 상태). 대리님이 ceo.console 에 지시를 적으면 Drive 에 `ahj_ceo_order_<id>.json` 이 올라가고, **다음 아침 점검(07시) 루틴이 읽어서 처리한 뒤 답변을 되돌려준다**(`ceoOrders` 의 status 접수→완료/보류 + reply). 즉시 답이 오는 채팅창이 아니라 "내일 아침 처리" 함이다. 이미 완료·보류로 답한 지시는 다시 처리하지 않는다.
- **KPI**: 매주 팀 KPI 양식에 입력한다. 대시보드 홈 "주간 KPI 입력표"가 같은 기준으로 계산한다.
- **블로그 게시**: 네이버에 올린 뒤 대시보드 카드의 "네이버에 올렸어요 → 발행 완료" 버튼을 누르면 발행완료가 되고 글 주소를 붙여넣을 수 있다. 아침 루틴은 발행대기 20건 이상이면 새 글을 만들지 않고, 10~19건이면 1건, 그 아래면 1~2건만 만든다.
- **우리 블로그는 셋이다.** 발행 확인(`-verify` 청크)에서 아래 셋은 모두 "발행완료"로 채택한다. 예전에는 공식블로그만 인정해서, 대표님 블로그에 올라간 글이 계속 발행대기로 남아 적체를 키웠다.
  - `ykphone_edu` — 공식블로그. **권리분석 물건 분석글을 올리는 곳이다.**
  - `hjko0` — 대표님 블로그. 학원 모집·정보성 글 위주.
  - `gkgk0307_` — 서브블로그. 비중이 낮으니 여기 글이 안 잡혀도 따로 파고들지 않는다.
  주소 형태가 `blog.naver.com/<id>` · `m.blog.naver.com/<id>` · `PostList.naver?blogId=<id>` 로 제각각이라 전체 URL 이 아니라 **블로그 아이디**로 비교한다(`scripts/blog_publish_match.py` 의 `OUR_BLOG_IDS`).
  주의: 네이버 검색 API는 블로그 주인으로 거르지 못하고 검색어로만 찾는다. 특정 블로그의 글 목록을 통째로 가져올 방법이 없다. "옆커폰부동산에듀" 검색에 안 걸리는 글(브랜드명이 본문에 없는 글)은 사건번호나 제목 키워드로 따로 검색해야 찾을 수 있다. 2026-09-11 기준 `gkgk0307_` 는 브랜드 검색·사건번호 검색 어디에도 한 건도 안 잡혔는데, 서브블로그라 그냥 두면 된다.
- **발행 확인은 제목이 아니라 사건번호로 맞춘다.** 대리님이 올릴 때 제목을 다시 쓰는 경우가 많아 대시보드 제목과 실제 게시 제목이 다르다(제목 매칭으로는 6건이 몇 주째 안 잡혔다). 권리분석 물건 분석글에는 사건번호가 거의 항상 들어가므로, 사건번호(`20\d\d타경\d+`)를 1순위 키로 쓴다. 사건번호는 고유해서 네이버 검색 결과가 2~20건뿐이라 우리 글이 있으면 반드시 걸린다.
  `scripts/blog_publish_match.py snapshot.json naver_results.json verify_chunk.json` 가 이 대조를 한다. naver_results.json 은 `search_blog` 결과를 그대로 모은 배열({title,description,link,bloggerlink,postdate})이면 된다. 우리 블로그 글만 고르고, 이미 url 이 있는 글은 건너뛰고, 같은 사건번호로 우리 글이 둘 이상이면 자동 채택하지 않고 ambiguous 로 뺀다.
  사건번호가 없는 정보성 글(뉴스·팁)은 이 방법으로 못 맞춘다. 그건 여전히 게시 직후 "발행 완료" 버튼 + 글 주소 붙여넣기가 필요하다.

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
| `ahj_market_chunk_` | 데일리 경매분석 upsert(caseNumber 기준). 현황판 연동도 이 형식 |
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

- `trig_01BvA6VTCjaQVkN93pbwgDgM` 22:06 UTC(07시 KST) — 아침 점검 4단계. A. 경매 결과 자동 동기화(`scripts/auction_results_sync.py`). B. 네이버 블로그 발행 확인 — 사건번호를 1순위 키로 `mcp__PlayMCP__NaverSearch-search_blog` 검색 후 `scripts/blog_publish_match.py` 로 대조, 우리 블로그 3곳(`ykphone_edu`·`hjko0`·`gkgk0307_`) 모두 채택, 매칭된 것만 `-verify` 청크 업로드. C. 대표 지시 처리 — `ahj_ceo_order_*.json` 을 읽어 처리하고 `ahj_patch_chunk_..._ceo.json` 으로 `ceoOrders` 에 status·reply 를 되돌려준다. D. 세 가지 각각 `routineRuns` 기록(`ahj_patch_chunk_..._routine.json`).
- `trig_017v14iuXGFcye7ijECz8PZK` 06:50 UTC(15:50 KST): 업무마감보고 작성. 업무일지 폴더(`1ZZysuh-...`)의 오늘 문서를 **읽기만** 해서 ①~⑥ 양식으로 정리하고 `ahj_patch_chunk_<날짜>_closing.json`(`workReports`, id `wr-<날짜>-closing`)으로 올린다. 각 건에 완료/진행/예정을 붙이고 **수치는 추정하지 않는다**(근거 없으면 "집계 예정"·"비교 자료 미확보"). 오늘 문서가 없으면 `hold` 로 기록하고 끝낸다.
- `trig_017apcdF32gc1UkJcRUGoU2f` 23:03 UTC(08시 KST): 블로그 제작 파이프라인(아이디어→정보검수→작성→SEO검수→최종검토). 각 단계의 상세 규칙은 `.claude/skills/blog-idea-scout`, `blog-fact-checker`, `blog-writer`, `blog-seo-editor`, `blog-final-reviewer` 스킬을 따른다(경매 물건 글은 `naver-auction-blog-writer`, 인스타 캐러셀은 `image-carousel-designer`, 경쟁사 분석은 `brand-strategy-analyst`). 요약 규칙: 메타디스크립션 첫 줄 필수, 본문 1,500자 이상, 질문형 소제목 2개 이상, 핵심정리·FAQ·해시태그 5개 이상, "무조건/확실한 수익" 금지, 출처 원문 대조 필수, 최근 7일 소재와 60% 이상 달라야 함. 소재 없으면 0건으로 기록.
- 도구 제약: WebFetch가 naver·chosun 도메인을 막는다. casenote.kr는 가끔 503(law.go.kr 대체). PlayMCP 세션이 자주 만료되니 ToolSearch로 다시 로드한다.

## 7. 최근 상태 메모 (2026-09-08)

- 21기 초급반 신규: 전다원(9/2 입금 330,000). 20기: 조은성·백진욱·정홍식·배주경·김옥란·최서하(9/3 카드 328,680)·노혜영·김유진.
- 김종익 150,000(9/4) = 대리입찰 컨설팅비.
- 권리분석 보고: 9/2 1건, 9/4 2건, 9/7 1건, 9/8 3건.
- 은행 거래는 2026-09-04까지 등록됨. 다음 엑셀이 오면 그 이후만 추가.
