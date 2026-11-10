# 전국 경매 물건 현황판 (market_board)

대구권 우선 전국 법원경매·공매 물건 현황판입니다. claude.ai 아티팩트 한 장짜리 HTML로 게시하고, 매일 06:00 KST 루틴으로 데이터를 갱신했습니다. Claude 계정을 옮기면서, 그때까지 한 세션과 저장소(`hyojun127/-`)에만 있던 빌드 원본·스크립트·데이터를 이 폴더로 모았습니다.

| 항목 | 값 |
|---|---|
| **새 게시 주소 (새 계정, 2026-11-10~)** | https://claude.ai/artifact/TfYdstJyqdtC2vuj88Ji2L — v1 · version id `1794318288-6a80` · contract `0.2.41` · capabilities `mcp: Google Drive[create_file]` |
| 새 작업 위치 | 저장소 `gkiv0307-spec/Ahnhyojun_dashboard` 브랜치 `claude/youthful-fermi-cz07ep`, 폴더 `market_board/` |
| 옛 게시 주소 (옛 계정 소유) | https://claude.ai/code/artifact/e6e3bb90-f77b-48af-aa80-3560d882ae4c |
| 내보낸 배포본 | v97 · version id `1794258507-83c9` · 빌드 시각 2026-11-10 06:08 KST |
| 런타임 contract | `0.2.41` |
| 원본 저장소 | `hyojun127/-` 브랜치 `claude/network-external-site-access-9ek78q`, 커밋 `4f617af` (2026-11-10 일일 갱신) |
| 물건 수 (data.json) | 4,616건 — 미확인 2,391 · 진행중 810 · 매각 557 · 종료 858 |

2026-11-10 새 계정에서 처음 게시했고, 새 주소를 `docs/routine-daily.md`·`docs/board-master-prompt.md`에 반영했습니다. 이후 갱신은 이 주소(`url`)로 publish 합니다.

---

## 폴더 구조

```
market_board/
├── README.md                 이 문서
├── deployed/
│   └── auction-board.live.html   마지막 배포본 그대로(Artifact read, 12,388,219 B). 게시 때 껍데기가 덧씌워진 상태라 다시 게시할 원본은 아니다.
├── site-template.html        뼈대·CSS·공통 함수 (빌드 원본)
├── site-pages.js             탭별 렌더러·대시보드 연동 (빌드 원본)
├── codef-queue.json          발굴 진행표(indexFrontier)·조회 큐 — 매일 갱신되는 상태 파일
├── scripts/                  데이터 생성·반영·빌드·검사 스크립트 전부
├── tools/detail-check.mjs    상세 화면 확인 도우미 (세션 스크래치패드에만 있던 것)
├── docs/
│   ├── routine-daily.md      매일 06시 루틴 절차서 (정본)
│   └── board-master-prompt.md 현황판 전체 재현·운영 명세 (필드·화면·스크립트·알려진 버그)
├── docs-datagokr.md          공공데이터 API·매칭 규칙 근거
└── data/                     빌드 입력 데이터 전부 (아래 표)
```

`docs/board-master-prompt.md`에 필드 이름, 화면 규칙, 스크립트별 동작, 알려진 버그 목록(9절)이 자세히 있습니다. 이 README는 빌드와 이전에 필요한 부분만 적습니다.

---

## 빌드

### 화면만 다시 만들기

```bash
cd market_board
bash scripts/build_site.sh auction-board.html     # data/*.json + site-template.html + site-pages.js → auction-board.html
node --check site-pages.js                        # 문법 검사
node scripts/check_site.mjs                       # 현재 폴더의 auction-board.html 을 11개 탭 × 밝음/어두움 × 1280/390px 로 렌더 검사
node tools/detail-check.mjs $PWD/auction-board.html '대구지방법원|2025타경10028|1'   # 상세 화면 확인
```

- `build_site.sh`는 `site-template.html`의 자리표시자 `__PAGES__`(site-pages.js), `__DATA__`(data.json), `__APTS__`, `__NEWS__`, `__DETAIL__`, `__ONBID__`, `__CARS__`, `__BDONE__`를 채우고 빌드 시각(`STAMP`)을 박습니다. 치환되지 않은 자리표시자가 남으면 실패합니다.
- `check_site.mjs`와 `detail-check.mjs`에는 Playwright(Chromium)가 필요합니다. `check_site.mjs`의 "ERR_FAILED" 글꼴 줄은 정상이고, 지금은 실패해도 exit 0입니다(알려진 버그).
- **HTML을 직접 고치지 않습니다.** 고칠 것은 `site-template.html`·`site-pages.js`·`data/`를 고치고 다시 빌드합니다.
- 2026-11-10 이 폴더에서 빌드한 결과는 원본 저장소 빌드와 빌드 시각 한 줄 말고는 같았습니다.

### 매일 갱신 순서 (06:00 KST 루틴)

정본은 `docs/routine-daily.md`입니다. 요약하면 다음 순서입니다.

1. **발굴** — 네이버 검색 API로 나이스옥션 색인을 받아 파싱합니다.
   ```bash
   python3 scripts/naver_search.py --check
   # 대구권 하루 3페이지 (codef-queue.json 의 indexFrontier.next 진행표대로, 페이지마다 파일을 따로)
   python3 scripts/naver_search.py raw181.tsv -q "나이스옥션 대구지방법원 대구광역시 {구} 아파트 감정가 최저가 용도" --display 30 --start 181
   python3 scripts/harvest_nice.py raw181.tsv --region 대구,경북 --since 2024 --clean --merge
   # 전지역 6곳 (indexFrontier.nationwide.resweep 의 i·start)
   python3 scripts/naver_search.py nw1.tsv -q "나이스옥션 {시도} {시군구} 아파트 감정가 최저가 용도" --display 30 --start 121 --sort date
   python3 scripts/harvest_nice.py nwall.tsv --region 서울,경기,인천,부산,대전,세종,광주,울산,경북,경남,충북,충남,전북,전남,강원,제주 --since 2025 --clean --merge
   ```
   발굴한 뒤 `codef-queue.json`의 `indexFrontier`(구별 next·exhausted, resweep i·start)를 올려 적습니다.
2. `python3 scripts/build_queue.py --write` — `--write` 없이 돌리면 드라이런이라 아무것도 저장하지 않습니다.
3. **색인 재확인(4-e)**
   ```bash
   python3 scripts/index_recheck.py --targets
   python3 scripts/naver_search.py idx.tsv --idx
   python3 scripts/index_recheck.py idx.tsv --write
   ```
4. Google Drive에서 새 `court_pc_*.json`·`*results*` 파일을 찾아 `data/court-in/`, `data/dash-in/`에 저장합니다(4-c, 4-f, 4-g).
5. `source scripts/datagokr.sh; bash scripts/daily.sh` — 이 순서로 돌립니다: apply_court(법원 조회 반영) → mask_names → dash_sync → (키 있으면) 실거래가 수집 → attach_rtms → screen_clean → mark_landmarks → dash_sync --auto → build_detail → build_site → build_queue --write. CODEF 단계는 키가 없으면 건너뜁니다.
6. `data/dash-out/dash-update-<날짜>.json`·`dash-auto-<날짜>.json`이 생기면 같은 이름의 `.title` 내용을 제목으로 Drive에 올립니다(아래 "Drive 청크 형식").
7. 빌드·검사(위) → `bash scripts/scan_secrets.sh` → 커밋 → 아티팩트 게시 → 대구권 조건이 맞으면 푸시 알림.

검색 스니펫 TSV는 커밋하지 않습니다. 사이트에 따라 임차인 실명이 가려지지 않은 채 들어 있습니다(`.gitignore`가 `*.tsv`를 막습니다).

---

## 새 계정에서 게시할 때

빌드한 `auction-board.html`을 게시합니다. `deployed/auction-board.live.html`은 게시 때 덧씌워진 껍데기가 들어 있어서 다시 게시할 원본으로 쓰지 않습니다.

- **런타임 contract**: `0.2.41`. 옛 아티팩트가 이 버전으로 고정돼 있었습니다(당시 최신은 0.2.96). 같은 동작을 원하면 첫 게시 때 `contract: "0.2.41"`을 지정합니다.
- **capabilities 선언 전체**:
  ```json
  {"mcp":{"servers":[{"server":"Google Drive","tools":["create_file"]}]}}
  ```
  '권리분석보내기'가 Drive에 파일을 쓰려면 이 선언이 있어야 합니다. 페이지는 `window.claude.use('mcp')`로 연결을 받고(런타임 0.2 방식, `window.claude.mcp` 멤버는 없음), 서버 이름 `'Google Drive'`로 `callTool(...,'create_file',...)`을 부릅니다. 새 계정에도 Google Drive 커넥터가 연결돼 있어야 합니다.
- 제목은 "전국 경매 물건 현황판", 탭 아이콘은 🏛️(옛 아티팩트 기준)입니다.

---

## "권리분석보내기"가 Drive에 쓰는 청크 파일

현황판과 '안효준 대리 업무 대시보드 · 데일리 경매분석'은 서로 직접 통신하지 않습니다. 현황판이 Drive 폴더에 JSON 파일을 하나 쓰면, 대시보드가 같은 폴더의 `ahj_market_chunk_*.json`을 읽어 같은 사건번호는 갱신하고 없으면 추가합니다(코드: `site-pages.js`의 `dashSend`·`dashItem`·`dashSyncResults`, 1417행 부근).

- **폴더**: Google Drive `1ZkIT6DPRGBg8DYu9ezNTEjo6ekUJMvZ4` (안효준 대시보드 백업)
- **create_file 인자**: `title`, `textContent`(JSON 문자열), `contentMimeType: "application/json"`, `disableConversionToGoogleType: true`, `parentId`(위 폴더)

| 쓰는 곳 | 파일 이름 | 내용 |
|---|---|---|
| 현황판 체크박스 (`dashSend`) | `ahj_market_chunk_<YYYY-MM-DD>_<키>_<YYYYMMDDTHHMMSS>.json` — 키는 `ct-<사건번호>-<물건번호>` 또는 `gm-<공매id>`에서 영문·숫자·한글·`._-` 외 글자를 `_`로 바꾼 것 | 물건 레코드 1건짜리 배열 |
| 현황판이 열릴 때 (`dashSyncResults`) | `ahj_market_chunk_<YYYY-MM-DD>_results_<YYYYMMDDTHHMMSS>.json` | 보낸 물건 중 진행중이 아니게 된 것의 `{caseNumber, courtResult, courtResultAt, updatedAt}` 배열 (결과별 1회) |
| 06시 루틴 갱신 (`dash_sync.py --write`) | `ahj_market_chunk_<날짜>_auto<N>_<UTC스탬프>.json` (`data/dash-out/dash-update-<날짜>.title`) | 이미 보낸 물건의 유찰·기일·최저가·매각·종료 변동 |
| 06시 루틴 자동 등록 (`dash_sync.py --auto --write`) | `ahj_market_chunk_<날짜>_lm<N>_<UTC스탬프>.json` (`data/dash-out/dash-auto-<날짜>.title`) | 대구권 조건 충족·대장 단지 자동 등록분 |

물건 레코드 형식 (`dashItem`):

```json
{
  "date": "YYYY-MM-DD",
  "buildingName": "⭐ 단지명 (대장 단지면 앞에 ⭐)",
  "exclusiveArea": 84.98,            // 건축물대장 전용면적만, 모르면 null
  "caseNumber": "2025타경10028 물건1", // 공매는 "공매 <관리번호>"
  "court": "대구지방법원",
  "region": "대구 북구",
  "propertyType": "아파트",           // 아파트·오피스텔·다세대·연립·단독·다가구·상가·공장·토지·기타
  "address": "...",
  "appraisalValue": 0,
  "minSalePrice": 0,
  "saleDate": "YYYY-MM-DD",
  "failCount": 0,
  "status": "조사중",                 // 이미 보낸 물건이면 이 칸을 빼고 보낸다(대시보드 값을 덮지 않도록)
  "winningBid": 0,
  "memo": "현황판 권리분석보내기 (날짜) · 특이사항 …",
  "analysisWritten": false,
  "source": "전국 경매 물건 현황판",
  "sourceKey": "ct-2025타경10028-1",
  "updatedAt": "ISO8601"
}
```

체크 표시와 전송 기록은 각 브라우저의 localStorage(`auction-board.dash.sent.v1`, `auction-board.dash.result.v1`)와 저장소 `data/bdone.json`(루틴이 보낸 것)에 남습니다. localStorage는 새 계정이나 다른 브라우저로 옮겨지지 않습니다. 추적 목록 정본은 `data/dash-sent.json`이고, 사용자가 대시보드에서 지운 물건은 이 파일의 `removed`에 있어서 다시 보내지 않습니다.

---

## 데이터와 출처

| 파일 | 내용 | 출처 |
|---|---|---|
| `data/data.json` | 법원경매 물건 전부 (화면의 `D`) | 나이스옥션 등 경매정보 사이트의 **네이버 검색 색인 스니펫**(발굴, `harvest_nice.py`) · **법원경매정보**(사용자 PC 크롬에서 읽은 기일내역, `data/court-in/` → `apply_court.py`) · **CODEF 경매사건검색**(2026-09-25 종료, `apply_codef.py`) · 색인 재확인(richgo·경매알리미·보스옥션 스니펫, `index_recheck.py`) |
| `data/detail.json` | 물건 상세("경매지") | `data/codef-raw/` → `build_detail.py` |
| `data/codef-raw/` | CODEF 원본 응답 1,881건 | CODEF (종료). **내보낼 때 모든 문자열을 `mask_names`로 가렸다** — 아래 참고 |
| `data/court-in/` | 법원 조회 결과 파일과 반영 기록(`applied.json`) | 사용자 PC Claude 크롬 세션·ChatGPT 에이전트(`court_pc_*.json`)·탱크옥션 요약(`*-tank.json`) |
| `data/dash-in/` | 대시보드 결과 파일에서 뽑은 상태값 (메모 제외) | Drive `*results*` 파일 |
| `data/dash-out/` | Drive에 올린/올릴 청크와 `.title` | 루틴 생성 |
| `data/dash-sent.json` · `data/bdone.json` | 대시보드 추적 목록·보낸 물건 키 | 루틴·사용자 |
| `data/rtms.json` · `data/apts.json` | 아파트 매매·전월세 실거래 (2025-10~2026-09) | **국토교통부 실거래가** (data.go.kr 15126469·15126474) |
| 물건의 `br` 필드 | 전용면적·사용승인·세대수 | **건축HUB 건축물대장** (data.go.kr 15134735, `fetch_bldrgst.py`) |
| `data/bjdong.json` | 법정동 코드 | 건축물대장 조회용 |
| `data/onbid.json` · `data/cars.json` | 공매 부동산·자동차 | **온비드** (data.go.kr 15157207) · CODEF |
| `data/landmarks.json` | 권역별 대장 단지 명부 (⭐) | 사용자 지정 |
| `data/news.json` | 경매·대구·정책 뉴스 | 네이버 뉴스 검색 |
| `data/idx-targets.json` | 색인 재확인 대상 | `index_recheck.py --targets` |

법원경매정보(courtauction.go.kr)는 클라우드 서버 IP를 막습니다. 클라우드 루틴은 직접 열지 않고, 사용자 PC 크롬에서 사람이 보듯 천천히 조회한 결과 파일만 반영합니다. 유료 사이트(스피드옥션·richgo·경매알리미·탱크옥션 등)는 직접 긁지 않고 네이버 검색 API 스니펫만 씁니다.

### 개인정보

- `data/codef-raw/`의 매각물건명세서 비고에는 법원 문서 그대로의 실명(임차인·유치권자·매수인 등, 46개 파일 56곳)이 남아 있었습니다. 내보낼 때 모든 문자열에 `scripts/mask_names.py`의 `mask()`를 적용했습니다. 가린 사본으로 `build_detail.py`를 다시 돌려도 `detail.json`이 바이트까지 같은 것을 확인했습니다.
- 나머지 데이터는 원본 그대로입니다. `mask()` 검사에 걸리는 곳은 `court_pc_2026-10-16.json`(21곳)·`news.json`(2곳)인데 모두 '인수', '대항력', '절차' 같은 일반 낱말 오탐이고 실명은 아닙니다. 전화번호 모양 숫자는 자동차 제원관리번호·공매 관리번호입니다.
- 학생 정보는 이 현황판에 없습니다.

---

## 인증키 — 어디에 있는지만

값은 이 저장소 어디에도 없습니다. 커밋 전 `bash scripts/scan_secrets.sh`가 `~/.secrets/`의 실제 값으로 저장소를 훑습니다.

| 키 | 쓰는 곳 | 있는 곳 |
|---|---|---|
| `NAVER_CLIENT_ID` · `NAVER_CLIENT_SECRET` (실제로는 NAVER API HUB 키 쌍) | `naver_search.py` (발굴·색인 재확인) | 옛 계정 Claude 클라우드 환경 "경매정보"의 환경변수. 새 계정 환경에 같은 이름으로 다시 넣는다. 값은 NAVER API HUB(네이버 클라우드) 콘솔에서 확인. `NAVER_APIHUB_KEY_ID`/`NAVER_APIHUB_KEY` 이름도 읽는다 |
| `DATA_GO_KR_KEY` | 실거래가(`fetch_rtms.py`) | 환경변수 또는 `~/.secrets/datagokr`. 현재 어느 환경에도 없음 — data.go.kr 계정에서 재발급·확인 |
| `DATA_GO_KR_KEY_BLD` | 건축물대장·온비드(`fetch_bldrgst.py`·`fetch_onbid.py`) | `~/.secrets/datagokr-bld`. 위와 다른 data.go.kr 계정. 현재 없음 |
| `CODEF_CLIENT_ID` · `CODEF_CLIENT_SECRET` | CODEF (2026-09-25 종료) | 환경변수 또는 `~/.secrets/codef`. 다시 쓰지 않는다 — 다른 계정으로 데모를 다시 받지 않고 한도를 올리지 않는다 |
| `MOLIT_STAT_KEY` | (미사용) | `~/.secrets/molit-stat` |
| Google Drive | 청크 읽기·쓰기, '권리분석보내기' | claude.ai 커넥터 (구글 계정 연결). 폴더 `1ZkIT6DPRGBg8DYu9ezNTEjo6ekUJMvZ4` 접근 권한 필요 |
| `ahj_config_naver_apihub.json` | 대시보드 07시 루틴의 블로그 순위 확인 | 위 Drive 폴더 안 파일 (현황판 빌드에는 안 씀) |

키를 넣을 때는 `bash scripts/put_secret.sh <이름>`을 씁니다. 키를 채팅에 붙여 넣지 않습니다.

---

## 최근 고친 내용과 남은 문제

### 코드 변경 (원본 저장소 커밋)

- 2026-11-02 `b351b46` dash_court_chunk: 입찰예정 카드도 매각이면 '매각종료'로 닫는다
- 2026-11-02 `b1e614a` 법원 조회 건수 상한 삭제 — 기일 지난 미확인 건을 전부 본다
- 2026-11-02 `c7b2625` 대시보드 결과 입력 자동화: `dash_pending`(스냅샷→미입력 카드) · `courtin_add`(기일내역 저장) · `dash_court_chunk`(court-in→대시보드 청크)
- 2026-10-07 자동 등록 대구권에 경산·칠곡 포함, 대구 밖 대장 단지의 '기일 14일 안' 상한 폐지, 대항력 포기 확약이면 대항력을 권리 자국으로 치지 않음, apply_court가 탱크옥션 요약을 이름 없이 받음
- 2026-10-06 apply_court: '대구지방법원 서부지원' 표기를 현황판 표기로 맞춰 중복 추가 방지 · ChatGPT 결과(`court_pc_*.json`) 반영 · 법원 물건검색 신규 추가 경로

### 2026-11-03 ~ 11-10 루틴에서 손으로 바로잡은 것 (코드는 아직 안 고침)

1. **apply_court가 '취하' 결과에 빈 기일내역(`ld: []`, `full: true`)이 오면 기존 기일내역과 유찰 횟수를 지운다.** 11/06 2025타경1262(유찰 2회→0)를 직전 커밋 값으로 되돌렸다. 종국결과만 바꾸고 `ld`·`f`는 유지하도록 고쳐야 한다.
2. **dash_sync 갱신 파일의 status가 PC 세션(`dash_court_chunk`)이 쓰는 값과 다르다.** dash_sync는 '매각'·'조사중'을, PC 쪽은 '매각종료'·'취하'·'변경'을 쓴다. 그대로 올리면 PC가 닫은 카드가 다시 열려서 11/04~11/06 세 번 손으로 맞춰 올렸다(`dash-sent.json`의 `last.status`도 같이). dash_sync를 PC 쪽 값에 맞춰야 한다.
3. **dash_sync가 감정가(`ap`)가 없는 물건에 `appraisalValue: 0`을 보낸다.** 11/03·11/06 법원 첫 기일 최저가(`ld[0].amt`, 1회차 최저가 = 감정가)로 채워 올렸다.
4. `naver_search.py`는 출력 파일을 매번 덮어쓴다. 페이지마다 다른 파일 이름을 써야 한다.
5. 그 밖의 알려진 버그는 `docs/board-master-prompt.md` 9절에 있다.

### 운영 상태 (2026-11-10 기준)

- PC 법원 조회 결과 파일이 11/06부터 올라오지 않는다(마지막 `data/court-in/2026-11-05.json`). PC 쪽 예약 작업을 확인해야 한다.
- 대구 발굴 2회차: 북구·동구·수성구·달서구·남구는 1회차 구간과 겹쳐 닫았고, 지금 중구 A=91 차례다. 전지역 재순회는 `resweep i=38, start=121`.
- 실거래가(`rtms.json`)는 2025-10~2026-09로, data.go.kr 키가 없어 갱신이 멈춰 있다.
