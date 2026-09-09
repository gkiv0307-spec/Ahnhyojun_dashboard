# 안효준 대리 업무 대시보드 — 프로젝트 안내 (CLAUDE.md)

> 새 대화가 시작될 때 이 파일을 먼저 읽는다. 여기 적힌 것이 대리님 업무의 기본 맥락과 규칙이다.
> 여기 없는 사실은 지어내지 말고 대리님께 묻는다. 마지막 갱신: 2026-09-09.

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
- **KPI**: 매주 팀 KPI 양식에 입력한다. 대시보드 홈 "주간 KPI 입력표"가 같은 기준으로 계산한다.
- **블로그 게시**: 네이버에 올린 뒤 대시보드 카드의 "네이버에 올렸어요 → 발행 완료" 버튼을 누르면 발행완료가 되고 글 주소를 붙여넣을 수 있다. 아침 루틴은 발행대기 20건 이상이면 새 글을 만들지 않고, 10~19건이면 1건, 그 아래면 1~2건만 만든다.

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

- `trig_01BvA6VTCjaQVkN93pbwgDgM` 22:06 UTC(07시 KST): A. 경매 결과 자동 동기화(`scripts/auction_results_sync.py`) + B. 네이버 블로그 발행 확인. `mcp__PlayMCP__NaverSearch-search_blog`로 "옆커폰부동산에듀" 검색, `bloggerlink === https://blog.naver.com/ykphone_edu`만 채택. 매칭된 것만 `-verify` 청크 업로드.
- `trig_017apcdF32gc1UkJcRUGoU2f` 23:03 UTC(08시 KST): 블로그 제작 파이프라인(아이디어→정보검수→작성→SEO검수→최종검토). 각 단계의 상세 규칙은 `.claude/skills/blog-idea-scout`, `blog-fact-checker`, `blog-writer`, `blog-seo-editor`, `blog-final-reviewer` 스킬을 따른다(경매 물건 글은 `naver-auction-blog-writer`, 인스타 캐러셀은 `image-carousel-designer`, 경쟁사 분석은 `brand-strategy-analyst`). 요약 규칙: 메타디스크립션 첫 줄 필수, 본문 1,500자 이상, 질문형 소제목 2개 이상, 핵심정리·FAQ·해시태그 5개 이상, "무조건/확실한 수익" 금지, 출처 원문 대조 필수, 최근 7일 소재와 60% 이상 달라야 함. 소재 없으면 0건으로 기록.
- 도구 제약: WebFetch가 naver·chosun 도메인을 막는다. casenote.kr는 가끔 503(law.go.kr 대체). PlayMCP 세션이 자주 만료되니 ToolSearch로 다시 로드한다.

## 7. 최근 상태 메모 (2026-09-08)

- 21기 초급반 신규: 전다원(9/2 입금 330,000). 20기: 조은성·백진욱·정홍식·배주경·김옥란·최서하(9/3 카드 328,680)·노혜영·김유진.
- 김종익 150,000(9/4) = 대리입찰 컨설팅비.
- 권리분석 보고: 9/2 1건, 9/4 2건, 9/7 1건, 9/8 3건.
- 은행 거래는 2026-09-04까지 등록됨. 다음 엑셀이 오면 그 이후만 추가.
