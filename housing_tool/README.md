# 옆커폰 주택관리 현황 (housing_tool)

Claude 아티팩트 `https://claude.ai/artifact/SzpTKGX8aSEseNivq6ifXU` 의 최신 발행본을 계정 이전용으로 보관한 것입니다.

| 항목 | 값 |
|---|---|
| 파일 | `index.html` (발행본 HTML 원본 그대로, 수정 없음) |
| 발행 버전 | `1794207147-65b8` |
| 크기 | 691,519 bytes / 11,401줄 |
| SHA-256 | `13f189ef8af93d5986490041db840ee751351cecb4080190dfc8187f5d86a32b` |
| 받은 날짜 | 2026-11-10 (Artifact `action:"read"`) |

## 1. 런타임 contract 버전

```
contract: 0.2.41
```

새 계정에서 다시 발행할 때 동작을 똑같이 맞추려면 publish 시 `contract: "0.2.41"` 로 고정하는 것을 권장합니다
(생략하면 새 아티팩트는 기본 버전으로 발행되어 다를 수 있습니다 — 확인되지 않은 부분입니다).

## 2. capabilities 선언 전체

아티팩트 서비스에 저장된 선언 그대로:

```json
{
  "db": {},
  "downloads": {},
  "mcp": {
    "servers": [
      { "server": "Google Drive",
        "tools": ["read_file_content", "search_files", "download_file_content"] },
      { "server": "Google Sheets",
        "tools": ["get_spreadsheet", "get_values", "update_values", "update_spreadsheet"] }
    ]
  }
}
```

| capability | 코드에서 쓰는 곳 |
|---|---|
| `db` | `window.claude.use('db')` → 컬렉션 `state` 로 전체 데이터 클라우드 동기화 (아래 3-C) |
| `downloads` | `window.claude.use('downloads')` → `downloads.save()` 로 백업 JSON·내보내기 파일 저장 |
| `mcp` · Google Drive | 월세관리표·지출관리 xlsx 읽기/검색/다운로드 (읽기 전용) |
| `mcp` · Google Sheets | 자금일보·이체관리 시트 읽기 + **쓰기**(`update_values`, `update_spreadsheet` — 날짜 탭 복제, 행 기록), 현금영수증 대조용 매출표 읽기 |

> 새 계정에서 발행 시 위 JSON 을 `capabilities` 로 그대로 넘기고, 새 계정에 Google Drive / Google Sheets 커넥터를 연결해야 합니다.

## 3. 데이터 저장 위치

### A. 브라우저 localStorage (기기별)

| 키 | 내용 |
|---|---|
| `zipkeeper.v1` | 앱 전체 상태(JSON) — 건물·호실·계약·청구서·지출·중개사·문자 등. db 연결이 안 될 때의 기본 저장소이자 로컬 캐시 |
| `zipkeeper.backup.auth` | 자동 백업(Apps Script) **비밀문구** — 기기 로컬 전용, db·백업 파일에 올라가지 않음 |
| `zipkeeper.backup.meta` | 자동 백업 마지막 전송 정보 |
| `zipkeeper.navMode` | 메뉴 모드(`house` / 회계) |

localStorage 는 아티팩트 출처(origin)별이므로 **새 URL 로 발행하면 비어 있는 상태로 시작**합니다.

### B. Google Drive / Sheets (커넥터, 사용자 계정 권한)

코드에 기본값으로 박힌 파일 ID (설정 화면에서 변경 가능):

| 용도 | 파일 ID | 접근 |
|---|---|---|
| 부동산임차월세관리표_26년.xlsx (`settings.drive.rentFileId`) | `1jUY15QzDjJO40LtwLtf-EOHWfEsk9gtQ` | Drive 읽기 |
| 주택 지출관리.xlsx (`settings.drive.expenseFileId`) | `1w4_Na4Ck1hQJFByB0pu-bv3SwpMMmBIW` | Drive 읽기 |
| 부동산 자금일보 보고양식 | `1oZhlvCxenuM8LNQ4XoSrwa1zOPJMbTYHmqZVyi8Fvmk` | Sheets 읽기·쓰기 |
| [부동산]이체관리_자동문구 | `1kUKbSUju8N5AhBM_JonOijMXnuj-A9JBSa2WIoqfNZA` | Sheets 읽기·쓰기 |
| 거제점 / 군위 / 김해점 매출표 (현금영수증 대조) | `148XveCq…`, `1qpeR8_J…`, `1lj6tNLR…` | Sheets 읽기 |

새 계정의 Google 커넥터가 이 파일들에 접근 권한이 있어야 합니다(파일 ID 자체는 접근 권한이 아님).

선택 기능: **자동 백업** — 설정에서 `https://script.google.com/macros/s/.../exec` 엔드포인트와 비밀문구를 넣으면 매일 19시 이후 상태 JSON 을 Apps Script 로 보내 Drive 에 저장합니다. 엔드포인트 URL 은 `settings.autoBackup.endpoint`(데이터 안)에 있고 HTML 에는 없습니다. 비밀문구는 이 저장소에 포함하지 않았습니다.

### C. 아티팩트 db (원본 데이터의 클라우드 사본)

- 컬렉션: `state`
- 문서 ID: `settings`, `buildings`, `units`, `contracts`, `expenses`, `listings`, `templates`, `handover`, `smsLog`, `saleItems`, `saleLog`, `acct`, `bizreg`, `autopay`, `cashrcpt`, `agentsdb_<n>`(중개사, 120건 단위), `invoices_<연도>_<n>`(청구서, 연도별·120건 단위). 예전 `agents_<n>` 문서는 읽기만 하고 더 이상 쓰지 않음.
- 각 문서 형태: `{ "items": [...] }` (`settings` 는 `items[0]` 하나)
- 동작: 페이지가 열리면 db 를 읽어 로컬에 반영하고, 변경 시 0.4초 뒤 바뀐 문서만 씁니다. **db 가 비어 있고 로컬에 데이터가 있으면 로컬 데이터를 db 로 올립니다.**

**db 는 아티팩트 URL 에 묶여 있어 새 계정에서 새로 발행하면 따라오지 않습니다.** 반드시 옛 아티팩트에서 먼저 내보내세요.

> 이 세션(Claude Code)에서 `ArtifactData` 로 `state` 컬렉션을 읽으려 했으나 "shared with you from another organization … no access" 로 거부되어 실제 db 내용·문서 수는 확인하지 못했습니다.

## 4. 데이터 내보내기 → 새 아티팩트로 옮기기

**방법 1 (권장, 앱 내장 기능)**
1. 옛 계정에서 옛 아티팩트를 열고 상단 저장 상태가 "클라우드"(db 연결됨)인지 확인 — 그래야 db 최신본이 로컬에 반영됩니다.
2. `⚙️ 설정 · 백업` → **백업 파일 내려받기 (JSON)** → `옆커폰_주택관리_백업_YYYY-MM-DD.json` 저장 (downloads 승인 필요). 이 파일에는 자동 백업 비밀문구가 빠져 있습니다.
3. 새 계정에서 새로 발행한 아티팩트를 열고 `⚙️ 설정 · 백업` → **백업 파일에서 복원** 으로 그 JSON 을 불러옵니다.
4. 새 db 가 비어 있으므로 앱이 자동으로 복원된 데이터를 새 db 에 올립니다.
5. 자동 백업을 쓰던 경우 비밀문구를 새 화면에서 다시 입력합니다.

**방법 2 (Claude 세션에서 직접)** — 옛 아티팩트에 db 접근 권한이 있는 세션(옛 계정/조직)에서:
```
ArtifactData action:"list" url:<옛 아티팩트 URL> collection:"state" query:{limit:1000} out_dir:<폴더>
```
문서별 JSON 이 저장됩니다. 새 아티팩트에는 같은 `state/<doc_id>` 로 `ArtifactData batch`(set) 로 넣거나, 문서를 합쳐 방법 1의 백업 JSON 형태(`{version, settings, buildings, …, invoices, agents, …}`)로 만든 뒤 앱에서 복원하면 됩니다.

## 5. 원본 소스 / 빌드 스크립트

이 세션에는 원본 소스나 빌드 스크립트가 남아 있지 않습니다(아티팩트가 다른 계정·세션에서 발행됨). `index.html` 은 단일 파일(인라인 스크립트)이며 외부 의존은 cdnjs 의 `xlsx@0.18.5`, Google Fonts 뿐이라 이 파일만으로 다시 발행할 수 있습니다.

## 6. 다시 발행 시 체크리스트

- [ ] `Artifact` publish: `file_path: housing_tool/index.html`, `contract: "0.2.41"`, `capabilities`: 위 2번 JSON, `icon: "home"`
- [ ] 새 계정에 Google Drive · Google Sheets 커넥터 연결, 위 파일들 접근 권한 확인
- [ ] 옛 아티팩트에서 백업 JSON 내보내기 → 새 아티팩트에서 복원
- [ ] 자동 백업 비밀문구 재입력(사용 시)

## 참고

`index.html` 에는 비밀값(토큰·API 키)이 없지만, 기본값으로 들어간 업무용 전화번호(문자 발신·상담·대표)와 위의 Google 파일 ID 가 포함되어 있습니다.

## 7. 이관 진행 상태 (2026-11-10)

| 항목 | 상태 |
|---|---|
| 새 아티팩트 | 새 Claude 계정에 발행 — Version 3 (contract 0.2.41). 이 폴더의 `index.html` 은 **옛 계정 발행본 보관용**이다 |
| 원본 소스 | GitHub `hyojun127/-` 브랜치 `claude/blissful-hypatia-ffk2d3` (기존 `claude/housing-management-program-ckwl77` 의 `c2dbc1a` 에서 이어짐). `dist/zipkeeper-artifact.html` = 새 발행본 |
| 데이터 | 옛 대시보드 브라우저 백업(2026-11-10 13:07 UTC)을 새 대시보드에 복원. 새 db `state` 64개 문서 — 16개 항목 모두 백업과 일치 확인 (예전 형식 `agents_1..12` 12개는 앱이 쓰지 않아 제외) |
| 자동 백업 | Apps Script 방식은 아티팩트에서 `Failed to fetch` 로 막혀 **Google Drive 커넥터 방식으로 교체**: 내 드라이브에 `옆커폰_주택관리_자동백업_YYYY-MM-DD_HHmm.json.gz` (gzip). 바뀐 날만 · 최근 30회분 유지 · 한도 초과 시 조각 저장. 첫 백업 파일 생성 확인 (282,709 바이트) |
| capabilities (v3) | `db`, `downloads`, Google Drive `read_file_content · search_files · download_file_content · create_file · trash_file`, Google Sheets `get_spreadsheet · get_values · update_values · update_spreadsheet` |
| 구글 파일 접근 | 대시보드가 쓰는 시트 · 파일 10개 모두 새 계정 커넥터로 열림 확인 (쓰기 대상인 자금일보 · 이체관리는 편집 권한 있음) |
| 남은 일 | 새 대시보드 공유(필요한 사람), 옛 대시보드는 입력 중지 후 보관, Apps Script 웹앱 배포 중지 |
