# 옆커폰 호텔·펜션 통합 예약관리 시스템 — 설계서

> 개발 전 설계 문서. 정보구조 / 데이터구조 / 권한 / 화면구성 / 처리 프로세스를 먼저 정의하고
> 이 문서를 기준으로 `stay/` 하위를 구현했다.

- 위치: `stay/` (기존 경매매물 사이트 파일은 **하나도 수정하지 않음**. 신규 메뉴로 확장)
- 스택: 기존과 동일한 **정적 HTML + 바닐라 JS** (빌드 도구 없음, 파일로 바로 열림)
- 데이터: `localStorage` 기반 저장소 (`stay/assets/store.js`). 서버 API로 교체 가능하도록
  `Store.list/get/create/update` 한 겹으로 감쌈 — 나중에 Cloudflare Functions(D1/KV)로 갈아끼우면 됨
- 디자인: 기존 브랜드 토큰(골드 `#FFC300` + 잉크 `#0c0c0f` + Pretendard) 재사용.
  다만 데이터 밀도가 높은 업무화면이므로 **어두운 사이드바 + 밝은 본문**의 관리자 셸 형태

---

## 1. 정보구조 (IA)

```
숙박 예약관리
├── 대시보드              stay/index.html        전체 현황 KPI · 내 할일 · 최근신청 · 차트
├── 예약 신청             stay/new.html          신규 숙박 예약 신청서
├── 예약 관리             stay/requests.html     전체 예약 목록 (검색·필터·정렬)
│   └── 예약 상세         stay/detail.html?id=   기본정보 · 타임라인 · 단계별 처리 · 메모 · 로그
├── 승인 관리             stay/approvals.html    승인대기 건 (승인/반려/의견)
├── 정산 관리             stay/settlement.html   결제·증빙·비용처리·정산완료
├── 숙소 관리             stay/lodgings.html     호텔/펜션 마스터 (직영/제휴 구분)
├── 내 예약 조회          stay/mystay.html       예약번호+신청자명으로 진행상황 조회 (직원용)
├── 알림센터              stay/notifications.html
├── 공지 및 이용지침      stay/notices.html      신청방법·담당부서·규정·FAQ
└── 관리자                stay/admin.html        사용자/권한 · 전체 처리로그 · 통계 · 시스템설정
```

메뉴는 **권한별로 보이는 항목이 다르다**(2절 표 참고). 사이드바는 로그인 사용자의 역할에 따라 자동 필터링.

---

## 2. 사용자 권한 (Role)

| 코드 | 역할 | 설명 |
|---|---|---|
| `applicant` | 일반 신청자 | 각 지점 점장·관계자 |
| `booker` | 예약 담당자 | 실제 숙소 예약을 진행 |
| `approver` | 승인 담당자 | 비용 발생 건 승인/반려 |
| `finance` | 회계팀 | **예약 접수 담당 아님.** 예약완료 건의 결제·증빙·정산만 |
| `admin` | 관리자 | 전체 |

### 2-1. 메뉴 접근 권한

| 메뉴 | applicant | booker | approver | finance | admin |
|---|:-:|:-:|:-:|:-:|:-:|
| 대시보드 | ● | ● | ● | ● | ● |
| 예약 신청 | ● | ● | ● | ● | ● |
| 예약 관리 | ●(본인/지점) | ● | ● | ● | ● |
| 승인 관리 | – | 읽기 | ● | – | ● |
| 정산 관리 | – | 읽기 | – | ● | ● |
| 숙소 관리 | 읽기 | ● | 읽기 | 읽기 | ● |
| 알림센터 | ● | ● | ● | ● | ● |
| 공지/이용지침 | ● | ● | ● | ● | ●(작성) |
| 관리자 | – | – | – | – | ● |

### 2-2. 데이터 가시범위 (Row-level)

- `applicant` : **본인이 신청한 건 + 본인 소속 지점의 건**만 조회 가능 (`Store.visibleBookings()`에서 강제)
- 그 외 역할 : 전체 조회

### 2-3. 행위 권한 (Action)

| 행위 | applicant | booker | approver | finance | admin |
|---|:-:|:-:|:-:|:-:|:-:|
| 신규 신청 | ● | ● | ● | ● | ● |
| 접수 / 확인중 전환 | – | ● | – | – | ● |
| 추가정보 요청 | – | ● | – | – | ● |
| 승인 요청(상신) | – | ● | – | – | ● |
| 승인 / 반려 / 승인의견 | – | – | ● | – | ● |
| 예약 진행 / 예약번호·객실·비용 등록 / 예약완료 | – | ● | – | – | ● |
| 예약 변경 · 예약 취소 | 요청만 | ● | – | – | ● |
| 이용완료 처리 | – | ● | – | – | ● |
| 결제확인·결제방법·증빙·비용처리·정산완료 | – | – | – | ● | ● |
| 메모 작성 | ●(본인건) | ● | ● | ● | ● |
| 사용자·권한·숙소·설정 관리 | – | 숙소만 | – | – | ● |

> 로그인은 데모 목적상 **사용자 전환 방식**(상단 우측 사용자 칩 → 계정 선택). 실제 배포 시
> 사내 SSO/세션으로 `Auth.current()`만 교체하면 나머지 로직은 그대로 동작한다.

---

## 3. 처리 프로세스 & 상태 (14단계)

```
예약 신청 → 접수 → 승인 → 예약 진행 → 예약 완료 → 숙박 이용 → 정산 → 완료
```

| # | 상태 코드 | 라벨 | 담당 | 다음 상태 |
|---|---|---|---|---|
| 1 | `NEW` | 신규신청 | 신청자 | 접수완료 / 취소 |
| 2 | `RECEIVED` | 접수완료 | 예약담당자 | 확인중 / 취소 |
| 3 | `REVIEWING` | 확인중 | 예약담당자 | 승인대기 / 반려 / 취소 |
| 4 | `APPROVAL_PENDING` | 승인대기 | 승인담당자 | 승인완료 / 반려 |
| 5 | `APPROVED` | 승인완료 | 예약담당자 | 예약진행중 / 취소 |
| 6 | `BOOKING` | 예약진행중 | 예약담당자 | 예약완료 / 취소 |
| 7 | `BOOKED` | 예약완료 | 예약담당자 | 이용예정 / 취소 |
| 8 | `UPCOMING` | 이용예정 | 시스템/예약담당자 | 이용완료 / 취소 |
| 9 | `USED` | 이용완료 | 예약담당자 | 정산대기 |
| 10 | `SETTLE_WAIT` | 정산대기 | 회계팀 | 정산중 |
| 11 | `SETTLING` | 정산중 | 회계팀 | 정산완료 |
| 12 | `SETTLED` | 정산완료 | – | (종료) |
| 13 | `CANCELED` | 취소 | 예약담당자/관리자 | (종료) |
| 14 | `REJECTED` | 반려 | 승인담당자 | (종료) |

- 상태 전이는 `STATUS_FLOW` 화이트리스트로만 가능하고, 각 전이마다 **허용 역할**이 지정되어 있다.
- 전이가 일어나면 `Store.transition()`이 **처리로그 자동 기록 + 알림 자동 발송**을 수행한다.
- 예약완료(`BOOKED`) 시점에 예약번호·객실정보·확정금액이 없으면 전이가 막힌다(누락 방지).

### 3-1. 필수 입력 게이트

| 전이 | 필수값 |
|---|---|
| → 승인대기 | 예상비용, 담당자 지정 |
| → 예약완료 | 숙소 예약번호, 객실정보, 확정 예약금액 |
| → 정산중 | 결제방법, 실제 결제금액, 결제일 |
| → 정산완료 | 세금계산서 or 영수증 확인, 회계담당자 |

---

## 4. 데이터 구조

### 4-1. `booking` (예약)

| 필드 | 설명 |
|---|---|
| `id` / `code` | 내부 ID / 예약번호 `STAY-2026-0001` |
| `requestedAt` | 신청일시 |
| `applicantId` `applicantName` `branch` `dept` `phone` | 신청자 정보 |
| `purpose` | 이용 목적 |
| `lodgingType` | `HOTEL` / `PENSION` / `ETC` |
| `lodgingId` `lodgingName` | 이용 숙소 |
| `checkIn` `checkOut` `nights` | 체크인/아웃/숙박일수(자동계산) |
| `adults` `children` `guests` `rooms` | 인원(성인/아동/합계)·객실 수 |
| `guestName` `guestPhone` | 예약자명·연락처 |
| `estimatedCost` | 예상 비용 |
| `costBearer` | `COMPANY` / `BRANCH` / `PERSONAL` / `ETC` |
| `specialRequest` | 특별 요청사항 |
| `attachments[]` | 첨부파일 `{name,size,type,dataUrl}` |
| `status` | 14개 상태 코드 |
| `assigneeId` `assigneeName` | 예약 담당자 |
| `approval` | `{requestedAt, approverId, approverName, result, opinion, decidedAt}` |
| `reservation` | `{confirmNo, roomInfo, amount, reservedAt, note}` |
| `payment` | `{status, method, paidAmount, paidAt, taxInvoice, receipt, evidence[], financeName, settledAt}` |
| `changeRequest` `cancelRequest` | 신청자의 수정/취소 요청 `{at,reason,handled}` |
| `memos[]` | `{at, userId, userName, role, text}` |
| `updatedAt` | 최종수정일 |

### 4-2. 그 외 컬렉션

- `users` : `{id,name,role,branch,dept,phone,email,active}`
- `branches` : `{id,name,region}`
- `lodgings` : `{id,name,type,ownership(DIRECT/PARTNER),region,address,managerName,managerPhone,homepage,rackRate,partnerRate,discountRate,roomInfo,usage,cancelPolicy,checkInTime,checkOutTime,caution,note,active}`
- `logs` : `{id,at,bookingId,bookingCode,userId,userName,role,branch,action,field,from,to,memo}` — **모든 변경 기록**
- `notifications` : `{id,at,type,title,body,bookingId,roles[],userIds[],readBy[]}`
- `notices` : `{id,category,title,body,pinned,author,createdAt,updatedAt}`
- `settings` : `{codePrefix, autoUpcomingDays, approvalThreshold, ...}`

### 4-3. 알림 (확장 가능 구조)

`Notify.send(event, payload)` → 내부 알림센터에 적재 + `Notify.channels` 배열의 어댑터에 순차 위임.
현재 어댑터는 `inapp` 하나만 등록되어 있고, 카카오톡/문자/이메일/Slack 어댑터는
`{ id, enabled, send(notification) }` 형태로 추가만 하면 붙는다 (관리자 > 시스템 설정에서 on/off).

알림 발생 이벤트: `BOOKING_CREATED`, `APPROVAL_REQUESTED`, `APPROVED`, `REJECTED`,
`BOOKING_CONFIRMED`, `BOOKING_CHANGED`, `BOOKING_CANCELED`, `CHECKIN_TOMORROW`, `SETTLE_WAITING`

---

## 5. 화면 구성 원칙

- **한 화면에 상태가 다 보이게**: 목록 표에 상태/결제상태 배지를 함께 노출
- **클릭 최소화**: 목록에서 바로 다음 단계 처리 버튼 노출(권한 있는 경우), 상세는 단일 페이지에 전 과정
- **내 할일 우선**: 대시보드 최상단에 로그인 역할 기준 "지금 처리해야 할 업무"만 모아서 표시
- **검색/필터 강화**: 기간·지점·신청자·숙소·상태·담당자·결제상태 + 키워드 통합검색
- PC 우선, 960px 이하에서 사이드바는 오프캔버스, 720px 이하에서 표는 카드형으로 전환

---

## 6. 향후 서버 연동 지점

| 지금 | 나중에 |
|---|---|
| `Store._read/_write` (localStorage) | `fetch('/api/stay/...')` |
| `Auth.current()` (계정 전환) | 사내 SSO 세션 |
| `Notify.channels = [inapp]` | + kakao / sms / email / slack 어댑터 |
| 첨부파일 dataURL | R2/S3 업로드 후 URL 저장 |

---

## 6-1. 배포 링크 2개 (staff / admin)

같은 코드베이스에서 **배포 모드**만 바꿔 두 가지 링크를 만든다.
`window.STAY_MODE = 'staff'` 를 지정하면 직원용, 지정하지 않으면 관리용이다.
(정의: `stay/assets/auth.js` 의 `Deploy`)

| | **링크 1 — 직원용** (지점 직원 배포) | **링크 2 — 관리용** (부동산팀) |
|---|---|---|
| 예약 신청 | ● 로그인 없이 이름·지점 직접 입력 | ● |
| 내 예약 조회 | ● 예약번호 + 신청자명으로 조회 | – (예약 관리 목록으로 갈음) |
| 숙소 안내 | ● 보기 전용, 직영 숙소 우선 노출 | ● 등록·수정 |
| 공지·이용지침 | ● 보기 전용 | ● 작성·수정 |
| 대시보드 / 예약 관리 / 승인 / 정산 / 알림센터 / 관리자 | – | ● |

직원용에서 지켜지는 것:
- 관리 화면은 **번들에 코드 자체가 포함되지 않는다**(`STAFF_PAGES` 4개만 빌드).
  주소를 직접 입력해도 `Deploy.allowsRoute()` 가 막고 예약 신청 화면으로 되돌린다.
- 상단바에 계정 전환·알림·전체검색이 없다.
- 내 예약 조회는 **예약번호와 신청자명이 모두 일치해야** 열린다. 번호만으로는 열리지 않으므로
  다른 사람의 예약을 훑어볼 수 없다.
- 숙소 안내에는 다른 지점의 이용 실적이 나오지 않는다(이용방법·규정·가격만).

빌드:
```bash
node stay/build-preview.mjs
#  → stay/preview.html        (관리용, 화면 11개)
#  → stay/preview-staff.html  (직원용, 화면 4개)
```

## 7. 실행 방법

빌드 도구가 필요 없다. 정적 파일이라 아래 아무 방법이나 된다.

```bash
# 로컬 서버 (권장 — 파일 프로토콜에서도 동작하지만 서버가 안전하다)
python3 -m http.server 8000
# → http://localhost:8000/stay/index.html
```

기존 Cloudflare Pages에 그대로 배포하면 `/stay/` 경로로 접근된다.

### 데모 계정 전환

우측 상단 사용자 칩을 누르면 권한별 계정을 바꿔가며 화면을 확인할 수 있다.
(실제 운영에서는 `Auth.current()` 만 사내 세션으로 교체)

| 계정 | 권한 | 확인 포인트 |
|---|---|---|
| 김도현 (대구점) | 일반 신청자 | 본인/지점 건만 보임, 관리자 메뉴 없음 |
| 박서연 (예약관리팀) | 예약 담당자 | 접수·예약진행·예약완료 버튼 노출 |
| 이재훈 (경영지원팀) | 승인 담당자 | 승인 관리에서 승인/반려 |
| 최유진 (회계팀) | 회계팀 | 정산 관리만, 승인 메뉴 없음 |
| 안효준 (본사) | 관리자 | 전체 + 통계/로그/권한/설정 |

초기 데이터는 첫 접속 시 자동 생성된다(최근 12개월치 예약 46건 · 처리로그 약 475건 · 숙소 7곳 · 공지 8건).
관리자 > 시스템 설정 화면의 **데모 데이터 초기화** 로 언제든 되돌릴 수 있다.

## 8. 검증 내역

이 구현은 아래를 실제로 실행해 확인했다.

**데이터/로직 (Node, 50개 검사 전부 통과)**
- 시드 정합성: 예약번호 중복 없음, 숙박일수·인원 합계 자동계산 일치, 정산완료 건 증빙 존재
- 권한: 신청자는 전체 46건 중 본인+지점 건만 조회, 관리자 메뉴 비노출
- 상태 전이 전 구간(신규신청→…→정산완료): 권한 없는 역할 차단, 단계 건너뛰기 차단
- 필수값 게이트: 담당자 미지정 시 승인요청 차단 / 예약번호 없이 예약완료 차단 /
  결제정보 없이 정산 차단 / 증빙 없이 정산완료 차단
- 로그: 모든 전이에 누가·언제·무엇(from→to) 기록, 시간순 정렬
- 알림: 역할별 도달 확인(승인요청→승인담당자, 정산대기→회계팀, 승인결과→신청자)
- 마스터 CRUD, localStorage 영속성

**화면/조작 (Chromium, 45개 검사 전부 통과 · 런타임 에러 0)**
- 신청서 실제 입력 → 숙박일수/인원/제휴가 자동계산 → 제출 → 예약번호 발급
- 목록에서 바로 접수 처리, 필수값 미입력 시 입력 모달로 자동 연결
- 승인/반려 의견 기록, 회계팀 정산 차단 메시지
- 검색·지점 필터·상태 칩·컬럼 정렬·CSV
- 모바일 390px: 오프캔버스 메뉴(✕/Escape/배경탭 닫기), 표 카드형 전환, 가로 스크롤 없음

## 9. 알려진 제약

- **저장소가 브라우저 localStorage 다.** 브라우저·기기 간 데이터가 공유되지 않는다.
  실사용에는 서버 저장소 연동이 필요하다(6절 참고). 현재 구조는 그 교체를 전제로 설계했다.
- 로그인은 계정 전환 방식(데모)이다. 사내 SSO 연동 전까지는 권한 위조가 가능하므로
  실제 운영 데이터를 넣기 전에 인증을 먼저 붙여야 한다.
- 외부 알림(카카오톡/문자/이메일/Slack)은 **연결 지점만 준비**되어 있고 어댑터는 미구현이다.
- 첨부파일은 dataURL로 localStorage에 저장되므로 용량 제한(파일당 2MB)이 있다.
