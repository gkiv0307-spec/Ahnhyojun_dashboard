# 안효준 대리 업무 대시보드 — 프로젝트 안내 (CLAUDE.md)

> 새 대화가 시작될 때 이 파일을 먼저 읽는다. 여기 적힌 것이 대리님 업무의 기본 맥락과 규칙이다.
> 여기 없는 사실은 지어내지 말고 대리님께 묻는다. 마지막 갱신: 2026-09-22 (v85).

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
- **경매 업무**: 현황판에서 물건을 골라 권리분석을 한다. "권리분석보내기" 체크 → 대시보드 데일리 경매분석에 자동 등록(조사중, 분석글 미작성). 매각 결과는 **자동 동기화**한다: 매일 07시 루틴이 **법원경매정보(courtauction.go.kr) 1차 자료**에서 사건별 기일내역을 받아(`scripts/court_auction_fetch.py`) 대시보드와 대조해 유찰(다음 회차로 이동)·매각종료(타인 낙찰가 기록)·변경·취하를 `scripts/auction_results_sync.py`로 판정하고 `ahj_market_chunk_<날짜>_results.json`으로 올린다. 예전에는 현황판 HTML의 회차 기록(ld)을 봤는데, 현황판은 다른 세션이 빌드하는 2차 자료라 결과가 늦게 붙거나 아예 안 붙었다. 법원경매정보는 매각 다음 날이면 결과가 확정돼 있다. 현황판 HTML도 같은 스크립트가 그대로 읽으므로 보조 소스로 남겨둔다. **현황판은 남이 낙찰받은 물건을 status `매각` 으로만 적고 낙찰가는 비워 둔다.** 그래서 이 상태와 `유찰` 도 "결과가 덜 들어온 것"으로 보고 조사중·입찰예정과 함께 매일 다시 조회해, 낙찰가를 채우고 `매각종료` 로 올린다(2026타경33 등 5건이 이 때문에 낙찰가 0원인 채 남아 있었다). `매각` 은 `MARKET_STATUS` 에도 들어 있어야 한다 — 없으면 상태 드롭다운이 이 값을 표현하지 못해 첫 항목(조사중)으로 보이고, 그대로 저장하면 실제 상태가 조용히 뒤집힌다. `selectHtml` 도 목록에 없는 현재 값을 앞에 끼워 넣어 같은 사고를 막는다. **매각기일이 안 지난 물건도 매일 확인한다**(2026-09-16, `--all`). 대리님은 "이 물건이 아직 진행 중인지 끝났는지" 를 카드에서 바로 보고 싶어 한다. 취하·취소·기각은 기일 전에도 생기고 기일이 바뀌기도 하므로(9/16 확인에서 9/22 기일 3건이 9/29 로 바뀌어 있었고, 10/15 기일 1건이 변경돼 있었다), 07시 루틴은 낙찰·패찰(대리님이 손으로 정한 것)을 뺀 모든 열린 물건을 법원 기록과 대조해 `courtResult` 에 "진행중 · 매각기일 M/D 최저 X원" 또는 결과를, `courtCheckedAt` 에 확인 날짜를 적는다. 카드에는 "법원 확인 M/D: …" 로 보인다(v74, 진행중이면 초록). 대시보드 기일·최저가가 법원과 다르면 법원 것으로 맞춘다. 88건 기준 3분쯤 걸린다. 대리님은 직접 입찰한 건만 낙찰/패찰로 바꾼다. 현황판에 결과가 아직 없는 물건만 홈 긴급 목록 "경매 결과 미입력 N건"과 카드 빠른 버튼으로 남는다. 대리님은 이 부분을 손으로 하지 않기를 원한다. 대리입찰 컨설팅도 한다. 경매 물건 블로그 글은 `.claude/skills/naver-auction-blog-writer` 규칙을 따른다.
- **AI 직원 업무 분장**: 루틴으로 돌리는 일은 직원별로 나눠 대시보드 "효제이 AI직원팀 → 업무 분장 · 루틴 상태" 카드에 표시된다. 각 루틴은 끝날 때 `ahj_patch_chunk_..._routine.json` 으로 `{op:"push", list:"routineRuns", fields:{id, job, at, status, summary, detail}}` 를 남겨야 한다. **기록을 안 남기면 대리님 화면에 "미실행"으로 뜬다.**

| job key | 담당 | 주기 |
|---|---|---|
| `auctionSync` | 운영 비서 | 매일 07:00 |
| `blogVerify` | 운영 비서 | 매일 07:00 |
| `ceoOrder` | 운영 비서 | 매일 07:00 |
| `closingReport` | 운영 비서 | 매일 15:48 |
| `analysisCheck` | 운영 비서 | 매일 12:00(낮 회차, 2026-09-23 추가) · 20:00 |
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
  - `gkgk0307_` — 서브블로그. 비중이 낮으니 여기 글이 안 잡혀도 따로 파고들지 않는다. 모바일 목록으로 보면 120건이 넘지만 대부분 `[공유]` 재공유 글이라 발행으로 세지 않는다.
  - **`rhghwjd00` 은 공식블로그(ykphone_edu)의 네이버 계정 id 다**(2026-09-17 확인). RSS 는 이 id 로 403 이 나고 글 링크도 전부 `ykphone_edu` 로 나온다. 대리님이 "rhghwjd00 블로그" 라고 하면 공식블로그 얘기다.
  - **RSS 50건 한계 보완 (2026-09-17)**: `scripts/blog_rss_fetch.py` 가 RSS 와 함께 모바일 블로그 API `https://m.blog.naver.com/api/blogs/<id>/post-list?categoryNo=0&itemCount=30&page=N` 을 4쪽까지 받아 링크 기준으로 합친다(브라우저 UA·Referer 필요, 계정 id 로도 됨). 그래서 옛 글까지 다 나오는데, `blog_publish_match.py` 의 `BACKFILL_SINCE="20260801"` 이 2026-08 이전 글과 `[공유]` 글을 backfill 에서 거른다(대리님 "그냥 두기" 결정을 코드로 고정). 공식블로그 7/15~8/7 권리분석 글 7건은 대리님 지시로 `ahj_patch_chunk_2026-09-17_blogbackfill_official.json` 으로 등록했다.
  주소 형태가 `blog.naver.com/<id>` · `m.blog.naver.com/<id>` · `PostList.naver?blogId=<id>` 로 제각각이라 전체 URL 이 아니라 **블로그 아이디**로 비교한다(`scripts/blog_publish_match.py` 의 `OUR_BLOG_IDS`).
- **발행 확인은 검색이 아니라 RSS 로 한다** (2026-09-14 변경). 네이버 검색 API 는 블로그 주인으로 거르지 못하고 검색어로만 찾는다. 그래서 본문에 브랜드명이 없는 글은 아무리 검색해도 안 걸렸고, 그 구멍으로 **공식블로그 글 90여 건이 대시보드 집계에서 통째로 빠져 있었다**(9/7~9/11 권리분석 글 13건 포함). 아침 루틴은 매일 "매칭 0건"만 보고하고 있었다.
  `https://rss.blog.naver.com/<블로그id>.xml` 은 검색어 없이 그 블로그의 **최근 50건**을 게시일까지 정확히 준다. WebFetch 는 naver 를 막지만 urllib·curl 로는 받아진다.
  - `scripts/blog_rss_fetch.py naver_results.json` — 우리 블로그 3곳 RSS 를 받아 `search_blog` 와 같은 모양({title,description,link,bloggerlink,postdate})으로 만든다. 한두 곳이 실패해도 나머지로 진행하고, 전부 실패하면 종료코드 1.
  - `scripts/blog_publish_match.py snapshot.json naver_results.json verify_chunk.json backfill_chunk.json` — 두 가지를 낸다. **verify** = 대시보드에 있는데 url 이 비어 있던 글을 발행완료+주소로 채움. **backfill** = 블로그에는 있는데 대시보드에 아예 없는 글을 blogPosts 에 새로 등록(`ahj_patch_chunk_..._blogbackfill.json`, url 을 키로 upsert 라 중복되지 않음). 같은 사건번호로 우리 글이 둘 이상이면 자동 채택하지 않고 ambiguous 로 뺀다.
  - 한계: RSS 는 최근 50건까지만 준다. 더 오래된 글을 찾아야 할 때만 `search_blog` 로 사건번호를 따로 검색한다.
  - `gkgk0307_` 는 전체 글이 2건(최신 2026-07-06)뿐인 사실상 휴면 블로그다. 그냥 두면 된다.
- **매칭 키는 제목이 아니라 사건번호다.** 대리님이 올릴 때 제목을 다시 쓰는 경우가 많아 대시보드 제목과 실제 게시 제목이 다르다. 권리분석 물건 분석글에는 사건번호가 거의 항상 들어가므로 사건번호(`20\d\d타경\d+`)를 1순위 키로 쓴다.
  사건번호가 없는 정보성 글(뉴스·팁)은 **제목 유사도**로 맞춘다(2026-09-16 추가, `title_match`): 정규화한 제목의 글자 유사도와 낱말 겹침 중 큰 값이 0.6 이상이고 후보가 하나뿐이며 게시일이 글 생성 사흘 전보다 늦을 때만. 대리님이 파이프라인 글을 제목을 고쳐 대표님 블로그(hjko0)에 올리면 예전엔 영영 발행대기로 남았다(8/12 글이 8/19 hjko0 게시 → 9/16 에야 잡힘). 같은 주소가 RSS backfill 로 이미 따로 등록돼 있으면 `blogrss-…` 사본을 지우는 delete 패치를 backfill 파일에 함께 낸다(글 하나가 둘로 세어지지 않게). 그래도 못 맞춘 글은 **url 기준 backfill** 로 새로 등록되므로 게시 사실 자체는 빠지지 않는다.

## 3. KPI 계산 기준 (팀 양식의 8월 기준값과 대조해 확정)

| KPI | 기준 |
|---|---|
| 에듀 블로그 콘텐츠 발행 | **실제 네이버 게시 수(발행완료, 게시일 `publishedAt` 기준)** — 2026-09-16 대리님 지시로 변경. 파이프라인 생성 수·대기 수는 참고(meta)로만 |
| 에듀 수강생 매출 | 은행 **입금 합계** |
| 에듀 순이익 | 입금 − 출금 |
| 에듀 신규 수강생 문의 | 수강생 DB 신규 등록 수 |
| 에듀 유료 수강생 등록 | 수강료(tuition) 입금 건수 |
| 에듀 체험단 운영 | DB 체험단 등록 수 |
| 경매 권리분석 완료 | **블로그에 실제 올라간 권리분석 글 수**(사건번호가 있는 발행완료 글, 게시일 기준) — 2026-09-17 대리님 지시 "내가 발행한 거면 다 잡아줘"(v82, `analysisPostsKpi`). 데일리 경매분석 카드가 없는 사건도 글이 올라갔으면 센다. 예전 수동 기록(`meta.kpiLog.analysis`, `ahj_kpi_log_chunk_`)은 참고로만 보여 준다 |

주는 월~일. 주간 목표 기본값: 블로그 7 / 매출 740,000 / 순이익 200,000 / 문의 6 / 유료 2 / 체험단 1 (월 목표는 ×5 수준). 대시보드에서 수정 가능.

## 4. 기술 구조 (대시보드)

- 단일 HTML 아티팩트. 데이터는 브라우저 localStorage(`ahj_realestate_dashboard_v1`) + Google Drive 백업.
- **라이브 오피스 스프라이트 z-index (v83)**: 직원 `.ag` 는 깊이 순서를 위해 JS 가 `z-index 200+y` 를 준다. `.office-stage`/`.office-wrap` 에 `isolation: isolate` 가 없으면 그 값이 문서 전체로 새어 메뉴 서랍(z 80)·모달(120) 위로 직원이 걸어 나온다(2026-09-22 발견). 사무실 CSS 를 손대도 이 격리는 지킨다.
- **블로그 자동화 담당 분리 (2026-09-23 대리님 지시)**: 네이버 임시저장 스크립트(`scripts/naver_autopost/`, Drive 폴더 "네이버 자동발행 스크립트"), Drive 폴더 "블로그 이미지"(GPT 이미지·image_map.json 규칙), 관련 루틴·문서(`STATUS-dashboard.md` 포함)는 **blog-auto 세션이 맡는다.** 이 세션(대시보드 세션)은 여기에 손대지 않는다 — 파일·스크립트·루틴을 만들거나 고치지 않고, 질문이 오면 blog-auto 세션으로 안내한다. 이 세션이 계속 하는 것: 08시 원고 생성(블로그 파이프라인 + GPT 교환 폴더 내보내기), 07시·12시·20시 발행 확인·권리분석 체크, 그 외 대시보드·경매·은행·업무일지 업무 전부.
- **블로그 GPT 교환 폴더 (2026-09-22)**: Drive 폴더 "블로그 GPT 교환" id `1FiETh0OJuly14r6GQ0tgh5nXp-Lkc_pd`. 08시 루틴 7단계가 발행대기 글을 `<글id>.md` 로 내보내고(`scripts/blog_gpt_export.py`), 대리님이 ChatGPT 로 다듬어 `<글id>_GPT최종.md` 로 저장하면 20시 루틴 5단계가 읽어 `ahj_patch_chunk_<날짜>_blog_gptfinal.json` 으로 body·title 을 갱신한다(`scripts/blog_gpt_import.py`, 스냅샷 body 와 같으면·글ID 불일치면·발행대기가 아니면 건너뜀). 상태는 발행대기 그대로, 네이버 게시와 "발행 완료" 버튼은 사람 몫. 네이버 블로그 글쓰기 API 는 없고 브라우저 자동 로그인은 계정 정지 위험이라 게시 자동화는 하지 않는다.
- **아티팩트 링크가 안 열리는 이유**: Drive 연결(mcp) 페이지라 비공개다. 대리님 claude.ai 계정으로 로그인된 브라우저에서만 열리고, 카톡·메일 앱 안 미니 브라우저나 다른 계정에서는 로그인 화면·빈 화면이 나온다. 짧은 주소 https://claude.ai/artifact/4WQE1xaYz5PQShTMgGxpta 와 긴 주소는 같은 아티팩트다.
- Drive 폴더 "안효준 대시보드 백업" id `1ZkIT6DPRGBg8DYu9ezNTEjo6ekUJMvZ4`. 스냅샷은 **`ahj_dashboard_snapshot.json.gz`(gzip, v81 2026-09-16 부터, 정상 150~400KB)** — 최신 파일이 현재 상태. 예전 평문 `ahj_dashboard_snapshot.json`(약 900KB~1MB)도 같이 검색해 modifiedTime 최신 것을 쓴다. **검색은 정확한 제목(`title = …`)으로만** — 폴더에 `ahj_dashboard_snapshot_이전전보관_2026-09-11.json` 처럼 이름을 바꿔 둔 옛 파일이 있어서 `title contains` 로 찾으면 이름 바꾼 시각(2026-09-17 22:10Z)이 최신으로 잡혀 9/11 자료를 쓰게 된다(2026-09-18 발견, 루틴 프롬프트 3개 수정).
- **1MB 한계 사고 (2026-09-11~16)**: 스냅샷이 9/11 에 이미 1,017KB 였고 그 뒤 블로그 backfill 49건·업무일지·법원 확인 기록이 붙어 1MB 를 넘자 아티팩트→Drive `create_file` 호출이 전부 실패했다(9/11 이후 스냅샷 0건, 폰·PC 모두). 아티팩트의 커넥터 호출은 1MB 근처가 상한이다. v81 부터 `CompressionStream` 으로 gzip 압축해 `base64Content` 로 올린다(1,017KB → 198KB). 받을 때는 파일 이름과 상관없이 첫 두 바이트 `1f 8b` 로 gzip 을 판단해 `DecompressionStream` 으로 푼다. 압축을 지원하지 않는 브라우저는 예전처럼 평문으로 올린다. **루틴 스크립트(`scripts/*.py`)의 `load_snapshot()` 도 같은 규칙**이라 압축본을 그대로 넘겨도 된다. 루틴 프롬프트(07시·20시·08시)도 `.json.gz` 우선으로 고쳤다. 백업 화면 "마지막 저장 크기" 로 확인한다.
- **휴대폰(Safari)에서는 스냅샷 저장이 응답 없이 멈추는 일이 있다**(2026-09-16 확인 — 07:14 부터 "동기화 중…" 에 11분 넘게 걸림). 예전 코드는 그 호출이 끝나기를 영영 기다리며 `driveSyncBusy` 를 잡고 있어 이후 저장이 전부 조용히 버려졌다. v75 부터 저장에 90초 제한을 두고, 넘기면 오류로 돌려 30초 뒤 다시 시도하며, 백업 화면에 "마지막 저장 오류" 로 사유를 보여 준다. 그래도 휴대폰에서 1MB 저장이 계속 실패하면 **PC 크롬으로 한 번 열어 저장**하는 것이 확실하다. `마지막 클라우드 동기화` 시각은 **내려받기(pull)에도 갱신되므로** 저장 성공의 증거가 아니다 — Drive 폴더에 새 `ahj_dashboard_snapshot.json` 이 생겼는지로 판단한다.
- **빈 스냅샷 사고 (2026-09-16 07:35)**: 폰 크롬(새 브라우저, 로컬 비어 있음)이 1MB 원본 내려받기에 실패한 채 청크만 얹어 11KB~633KB 짜리 부분 스냅샷 12개를 1분 사이에 "최신"으로 올렸다. 다른 기기가 열면 그걸 받아 전부 덮어쓸 뻔했다. 12개 모두 휴지통으로 보내 9/11 원본을 최신으로 되돌렸다. v77 안전장치: ① 클라우드 원본을 한 번도 못 받은 기기에서 핵심 데이터(학생·거래·경매·DB·블로그 합계)가 50건 미만이면 저장하지 않는다(`cloudPulledOnce`, `coreItemCount`). ② 받은 스냅샷이 로컬의 절반 미만이면 덮어쓰지 않고 알림만 남긴다. ③ 이미 데이터가 있는 기기는 원본을 받은 것으로 친다. **대시보드는 PC 크롬에서 연다. 휴대폰은 보는 용도로만.** 스냅샷 크기가 900KB 근처가 아니면 의심한다.
- **나(Claude)는 대시보드 데이터를 직접 못 고친다.** 폴더에 작은 청크 JSON을 올리면 대시보드가 열릴 때 자동 병합한다. 스냅샷 전체를 수정·재업로드하지 않는다.

| 청크 접두사 | 용도 · 형식 |
|---|---|
| `ahj_bank_addition_chunk_` | 은행 거래 추가 `[{sig,date,description,deposit,withdrawal,balance,studentId,category,installmentId,expenseCategory?}]`, sig = `날짜|적요|입금|출금|잔액`, sig 중복은 건너뜀. category 는 `tuition`/`consulting`/`capital`/`general`/`reimburse`(대납 회수, 매출 제외), 지출 대납은 `expenseCategory:"edu_advance"` |
| `ahj_bank_category_patch_chunk_` | `[{sig, category}]` 비어 있을 때만 채움 |
| `ahj_student_add_chunk_` | 수강생·매출 명단에 학생 추가 `[{student:{…}, dbPatch?, txSig?}]` (마법사 없이 원격 등록) |
| `ahj_student_tuition_patch_chunk_` | `[{studentId, tuition}]` tuition 0일 때만 |
| `ahj_revenue_reconfirm_chunk_` | `[{kind:"student", studentId, txSig}]` 결제완료 + 입금일·카드 표시 |
| `ahj_course_start_patch_chunk_` | `[{studentId, courseStartDate}]` 덮어씀 |
| `ahj_market_chunk_` | 데일리 경매분석 upsert. **사건번호+물건번호로 맞춘다**(`marketCaseKey`) — 현황판은 `2026타경33 물건1` 처럼 꼬리를 붙여 보내고 손으로 만든 카드에는 꼬리가 없어서, 글자로만 맞추던 예전에는 같은 사건이 카드 두 장으로 갈라졌다(7건). 꼬리가 없으면 물건1로 본다. 얹을 때 `applyMarketChunkFields` 규칙: 메모는 덮어쓰지 않고 합치고, 0·빈 값으로 기존 값을 지우지 않으며(현황판은 낙찰가를 0으로 보낸다), **상태는 덜 진행된 값으로 되돌리지 않는다**(v84 `MARKET_STATUS_RANK`: 조사중 < 입찰예정·변경·유찰 < 매각 < 매각종료·취하 < 낙찰·패찰. 2026-09-21 현황판이 8824·8801·1098·3134 를 `물건1` 꼬리로 다시 보내면서 status 조사중으로 변경·입찰예정을 되돌린 사고 뒤 추가. 낙찰·패찰은 대리님이 정하는 값이라 청크가 못 덮는다), `failCount` 는 늘어날 때만 받고, `analysisWritten` 은 켜기만 한다. `caseNumber`·`id` 는 기존 표기를 지킨다 | **v85 (2026-09-22 대리님 지시): 현황판 자동 등록(메모에 "자동 등록", "권리분석보내기" 아님) 새 카드는 매각기일이 오늘부터 14일 안일 때만 올린다.** 밖이거나 기일 미정이면 `state.meta.pendingMarketAdds` 에 두고 매 병합 때 다시 판정해 2주 안으로 들어오면 자동으로 올린다(대기 중 도착한 결과 줄도 대기 항목에 얹는다, 90일 지나면 놓아줌). 기일이 이미 지난 것은 올리지 않는다. 권리분석보내기 물건·손으로 만든 청크·기존 카드 갱신은 제한 없음. 데일리 경매분석 화면 위에 "⏳ 현황판 자동 등록 대기 N건" 으로 보인다. 필터 이전에 이미 올라간 2주 밖 카드는 그대로 둔다. **국민평형 기준(같은 날 추가 지시)**: 전용면적을 알 수 있으면(청크 `exclusiveArea` ㎡ 또는 메모 "전용 NN㎡") 95㎡ 초과는 대형평형으로 보고 올리지 않는다(`MARKET_AUTO_MAX_AREA`). 84형·34~36평형이 투자 수요의 중심이고 대형은 인기가 없다는 대리님 판단. 면적을 모르면 통과. 현황판 청크는 아직 면적을 안 보내므로 **현황판 빌드 세션에 `exclusiveArea`(건축물대장 `br.ar`)를 청크에 넣어 달라고 해야 한다.** **지운 물건은 되살리지 않는다**: 카드 삭제(UI·패치 delete)는 `state.meta.marketDeletedKeys` 에 사건키를 120일 기억하고, 현황판 자동 등록 줄이 다시 와도 올리지 않는다(권리분석보내기·수동 청크는 차단을 푼다). 2026-09-22 정리한 대형 4건(포스코더샵 151㎡·반석마을2단지 150㎡·금성백조예미지 101㎡·동탄파크자이 99.7㎡)은 `MARKET_AUTO_EXCLUDED_SEED` 에도 박아 뒀다(`ahj_patch_chunk_2026-09-22_market_kukmin.json` 으로 삭제 + 나머지 카드에 exclusiveArea 기입). 카드에 "전용 NN㎡" 알약이 보인다(95 초과면 주황).
| `ahj_kpi_log_chunk_` | `[{key:"analysis", date, count}]` 권리분석 건수 |
| `ahj_patch_chunk_` | **범용 패치** `[{op:"set"|"push"|"delete", list, match, fields, upsert?, allowBulk?}]` — 허용 목록의 아무 항목이나 수정·추가·삭제. 새 종류의 데이터 변경은 이걸 먼저 쓴다(재발행 불필요). 118명 이관 학생은 allowBulk 없이는 건드리지 않음 |
| `ahj_ceo_order_` | **대표 지시** — 대시보드가 올림 `{id,at,text}` (파일 1건 = 지시 1건). 아침 루틴이 읽어서 처리하고 `ahj_patch_chunk_..._ceo.json` 으로 `{op:"set", list:"ceoOrders", match:{id}, fields:{status,reply,repliedAt}}` 답변을 남긴다 |
| `ahj_blog_chunk_` | 블로그 파이프라인 결과 `{runAt,status,addedCount,note,items:[…]}` / `-verify` 파일은 `[{id,status,url,publishedAt}]` |

- 청크 파일명은 UTC 날짜. 같은 이름 파일이 있어도 id로 구분해 각각 한 번씩 처리된다. **받다가 실패한 파일은 처리됨으로 찍지 않는다**(2026-09-16, v73) — 예전에는 다운로드가 한 번만 실패해도 처리됨으로 못 박아 그 청크가 영영 사라졌다. Drive 가 간헐적으로 "service unavailable" 을 내므로 실제로 결과 청크가 조용히 빠졌다(2025타경9339 유찰 결과). 경매 청크는 같은 배치 안에서 카드를 만드는 줄을 먼저, 결과만 담긴 줄을 나중에 적용하고, 짝(카드)이 없는 결과 줄은 버리지 않고 `state.meta.pendingMarketPatches` 에 미뤄 뒀다가 다음 병합 때 다시 맞춘다(30일 지나면 놓아줌). 따라서 청크를 다시 올려야 할 때는 **새 파일(새 id)로** 올리면 된다.
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
- `trig_012sR8svRraK3bQQ7vksLjud` 11:00 UTC(20시 KST): 권리분석 체크 자동 반영 **+ 블로그 발행 확인 저녁 회차**(2026-09-16 추가 — 대리님이 낮에 올린 글을 그날 저녁에 발행완료로 잡는다. `-verify-evening` 청크와 `_blogdedupe_evening` 삭제 패치만 올리고 새 글 등록(backfill)은 아침 몫). 실제 사례: 9/16 오전 자동화로 hjko0 에 올린 "대구 아파트 경매 낙찰가율 79.5%…" 를 제목 매칭으로 잡아 `blogauto-20260908-1` 을 발행완료 처리(`ahj_blog_chunk_2026-09-16-verify2.json`). `scripts/blog_rss_fetch.py` + `scripts/market_analysis_check.py` 로 블로그에 올라간 권리분석 글과 `marketAuctions` 를 **사건번호로** 맞춰 `analysisWritten` 을 켠다(`ahj_patch_chunk_<날짜>_analysis.json`). **켜기만 하고 이미 켜진 것을 끄지 않는다** — 대리님이 직접 끈 것을 되돌리면 안 되기 때문이다. 사건번호가 정확히 같을 때만 켜고, 글이 아직 없는 물건은 목록으로만 보고한다. `caseNumber` 에 `2025타경1245 물건1` 처럼 꼬리가 붙은 항목이 있어 통째로 비교하면 안 맞는다(사건번호만 뽑아 비교).
- `trig_016Yoe4ydb8kZNxMh241ujXb` 03:00 UTC(12시 KST, 2026-09-23 대리님 지시 "12시에도 한번 더"): 20시 루틴의 권리분석 체크 + 발행 확인(verify)만 다시 돌린다. GPT 최종본 반입·backfill 은 안 한다. 청크 이름 꼬리 `_analysis_noon`·`-verify-noon`·`_blogdedupe_noon`·`_routine_noon`, routineRuns 는 job `analysisCheck` 로 남긴다(id `rr-<날짜>-analysisCheck-noon`). 배경: 대리님이 오전에 올린 권리분석 글이 저녁 20시까지 카드에 미작성으로 보이는 게 불편하다고 함. 자동 체크 자체는 정상이었다(9/23 대조: 카드 80건 중 58건 체크, 나머지 15건은 세 블로그 어디에도 사건번호 글이 없음).
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
- 권리분석 KPI 는 v82 부터 블로그 게시 글로 자동 집계한다(9/1~15 = 24건). 수동 보고는 더 안 받아도 된다.
- 은행 거래는 **2026-09-21 22:10(막삼가 126,000 출금)까지 등록됨** — 9/7~9/12 는 `ahj_bank_addition_chunk_2026-09-14.json`, 9/14~9/16 04:00 은 `ahj_bank_addition_chunk_2026-09-16.json`, 9/16 10:41~9/21 은 `ahj_bank_addition_chunk_2026-09-23.json`(13건, 입금은 펄크럼 환불 29,000·이자 801 뿐), **9/23 13:59~14:24 출금 6건**(국민제이 948,370·18,590 임대료 / 복합기 6·7·8월분 49,500×3 / 다우기술 51,000)은 화면 캡처로 받아 `ahj_bank_addition_chunk_2026-09-23b.json`. **잔액 공백**: 9/21 22:10 잔액 4,340,017 → 9/23 13:59 출금 전 잔액 4,391,031 이라 그 사이 +51,014 거래가 아직 미등록(캡처에 안 보임, 다음 엑셀에서 확인). 다음 엑셀이 오면 그 이후만 추가. 엑셀은 openpyxl 이 스타일 오류로 못 열므로 zip 에서 sheet XML 을 직접 파싱한다.
- **수강생 대납 정산 (v79, 2026-09-16)**: 임장·회식 때 회사카드로 긁고 수강생이 n분의 1 로 돌려준 돈은 매출도 비용도 아니다(회계상 입체금 → 회수). 입금은 분류 `reimburse`(정산입금, 미확정 입금 카드의 "정산입금" 버튼), 출금은 지출 분류 `edu_advance`(입체금)로 표시한다. `computeKpiValues` 의 **매출에서는 정산입금을 빼고, 순이익에는 차액만 넣는다**(v80: 회식엔 대리님·대표님 몫이 늘 섞여 회수액 < 결제액이 정상이고 그 차액이 곧 회사 식대(복리후생비). 더 걷혔으면 잡이익. 결국 순이익 = 통장 입금 − 출금 그대로). 홈 월별 카드도 순이익은 통장 그대로 두고 "회식 회사몫" 줄만 보여 준다. 은행 화면 "🤝 수강생 대납 정산" 카드가 달별로 대납 → 회수 차액(회사 몫·비용 처리 / 초과 회수·잡이익)을 보여 준다. `edu_advance` 는 적요 자동학습에서 제외한다(같은 식당을 다음에 회사 돈으로 쓸 수 있으니). studentId 는 연결하지 않는다.
  - 9/15 사례: 수강생 이름 소액 입금 12건 265,038원(적요 "파티"·"커피값") = 회식비 정산 → `reimburse`. 같은 날 범어동 카드 결제 5건 233,100원(산갈래닭갈비 168,000·공차 58,100·몬스터커피 4,000·케이엠파크 3,000) → `edu_advance`. 초과 회수 31,938원은 잡이익으로 순이익에 들어간다(회사 몫이 섞여 있으면 대리님이 출금 분류를 고친다). `ahj_patch_chunk_2026-09-16_settlement.json`(sig 매칭 + upsert 라 은행 청크보다 먼저 와도 안전).
