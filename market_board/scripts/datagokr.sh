#!/usr/bin/env bash
# 공공데이터포털(data.go.kr) 오픈API 호출 헬퍼
#
# 사용법:
#   source scripts/datagokr.sh
#   apt_trade 27260 202608          # 국토부 아파트 매매 실거래가
#   onbid_list DPSL_MTD_CD=0001     # 온비드 부동산 물건목록
#   onbid_detail PLNM_NO=... CLTR_NO=...   # 온비드 부동산 물건상세
#
# 필요한 환경변수는 .env.example 참고.

set -o pipefail

# ── 인증키 해석 ──────────────────────────────────────────────
# data.go.kr 인증키는 **계정마다 다르고, 서비스별로 활용신청을 따로 해야** 한다.
# 여기서 쓰는 두 키는 서로 다른 계정이라 바꿔 쓰면 통하지 않는다. 실측:
#   실거래가 키로 건축물대장 → SERVICE_KEY_IS_NOT_REGISTERED_ERROR
#   건축물대장 키로 실거래가 → SERVICE_KEY_IS_NOT_REGISTERED_ERROR
#
#   ~/.secrets/datagokr      실거래가 등 (기본)
#   ~/.secrets/datagokr-bld  건축HUB 건축물대장
#
#   _dgk_key            → 기본 키
#   _dgk_key bld        → 건축물대장 키 (없으면 기본 키로 되돌아감)
_dgk_key() {
  local svc="${1:-}" envvar file
  case "$svc" in
    bld) envvar="DATA_GO_KR_KEY_BLD"; file="$HOME/.secrets/datagokr-bld" ;;
    *)   envvar="DATA_GO_KR_KEY";     file="$HOME/.secrets/datagokr" ;;
  esac
  if [ -n "${!envvar:-}" ]; then
    printf '%s' "${!envvar}"
  elif [ -r "$file" ]; then
    tr -d '\n\r' < "$file"
  elif [ -n "$svc" ]; then
    _dgk_key                      # 서비스 전용 키가 없으면 기본 키로 시도
  else
    echo "ERROR: DATA_GO_KR_KEY 가 없습니다. 환경변수에 넣거나 ~/.secrets/datagokr 에 저장하세요." >&2
    return 1
  fi
}

# ── 국토교통 통계누리 (stat.molit.go.kr) ─────────────────────
# data.go.kr 이 아니라 국토교통부가 직접 운영하는 별도 포털이다.
# 인증키도 계정도 다르므로 _dgk_key 와 절대 섞지 않는다.
#
#   ~/.secrets/molit-stat   또는  환경변수 MOLIT_STAT_KEY
#
# ※ 인증키만으로는 호출되지 않는다. 통계표(자료)마다 'OPEN API 신청' 을
#   따로 넣고 관리자 승인을 받아야 하며, 요청 URL 은 그 신청 화면에서
#   통계표·양식·시계열을 고르면 생성된다. 그래서 엔드포인트를 여기에
#   미리 적어둘 수 없다 — 신청 후 받은 URL 의 경로를 molit_stat 에 넘겨라.
#   호스트가 다르면 MOLIT_STAT_BASE 로 덮어쓴다.
_molit_key() {
  if [ -n "${MOLIT_STAT_KEY:-}" ]; then
    printf '%s' "$MOLIT_STAT_KEY"
  elif [ -r "$HOME/.secrets/molit-stat" ]; then
    tr -d '\n\r' < "$HOME/.secrets/molit-stat"
  else
    echo "ERROR: 통계누리 인증키가 없습니다 (~/.secrets/molit-stat)." >&2
    return 1
  fi
}

# molit_stat <경로및쿼리>   예: molit_stat "getStat.do?statId=...&startDt=2021"
# 경로는 신청 화면이 만들어 준 URL 에서 따온다. 추측하지 마라 — 다 404 다.
molit_stat() {
  local q="${1:?신청 화면이 준 요청 경로 필요}" key
  key="$(_molit_key)" || return 1
  local sep='?'; case "$q" in *\?*) sep='&' ;; esac
  curl -sS --max-time 60 --retry 4 --retry-delay 2 --retry-all-errors \
       "${MOLIT_STAT_BASE:-https://stat.molit.go.kr}/${q#/}${sep}key=${key}"
}

# ── 엔드포인트 (환경변수로 덮어쓸 수 있음) ────────────────────
: "${RTMS_APT_TRADE_URL:=https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade}"
: "${ONBID_LIST_URL:=https://apis.data.go.kr/B010003/OnbidRlstListSrvc2}"
: "${ONBID_DETAIL_URL:=https://apis.data.go.kr/B010003/OnbidRlstDtlSrvc2}"

# ── 공통 호출부 ──────────────────────────────────────────────
# 주의 1: 반드시 https. http 는 이 환경의 egress 허용목록에 없어 403.
# 주의 2: 인증키는 Encoding 형식이므로 URL 에 그대로 넣는다(재인코딩 금지).
#         그래서 --data-urlencode 를 쓰지 않고 쿼리스트링을 직접 조립한다.
_dgk_get() {
  local base="$1" op="$2"; shift 2
  local key qs="" p
  key="$(_dgk_key)" || return 1
  for p in "$@"; do qs="${qs}&${p}"; done
  # --retry 만으로는 부족하다. curl 은 기본적으로 "일시적 HTTP 오류"(타임아웃/5xx)만
  # 재시도하고, 이 환경에서 실제로 관측되는 연결 리셋(exit 35)은 재시도하지 않는다.
  # 무인 실행에서 리셋 한 번에 단계가 통째로 죽으므로 --retry-all-errors 를 붙인다.
  curl -sS --max-time 60 --retry 3 --retry-delay 2 --retry-all-errors \
       "${base}/${op}?serviceKey=${key}${qs}"
}

# 응답이 에러면 메시지를 찍고 1을 반환
_dgk_check() {
  local body="$1" msg
  msg=$(printf '%s' "$body" | tr -d '\n' | grep -oE '<resultMsg>[^<]*|<errMsg>[^<]*' | head -1 | sed 's/<[^>]*>//')
  case "$msg" in
    ""|OK) return 0 ;;
    *) echo "API 오류: $msg" >&2; return 1 ;;
  esac
}

# ── 1) 국토교통부 아파트 매매 실거래가 ────────────────────────
# apt_trade <법정동코드5자리> <YYYYMM> [numOfRows]
apt_trade() {
  local lawd="${1:?시군구 법정동코드 5자리 필요 (예: 27260)}"
  local ymd="${2:?거래년월 YYYYMM 필요 (예: 202608)}"
  local rows="${3:-800}"
  local body
  body=$(_dgk_get "$RTMS_APT_TRADE_URL" getRTMSDataSvcAptTrade \
          "LAWD_CD=${lawd}" "DEAL_YMD=${ymd}" "pageNo=1" "numOfRows=${rows}") || return 1
  _dgk_check "$body" || return 1
  printf '%s' "$body"
}

# apt_trade_tsv <법정동코드> <YYYYMM>  → 단지명/면적/층/금액/일자 TSV
apt_trade_tsv() {
  apt_trade "$@" | python3 "$(dirname "${BASH_SOURCE[0]}")/rtms_tsv.py" trade
}

# ── 1-b) 국토교통부 아파트 전월세 실거래가 ────────────────────
# 권리분석에서 쓴다. 대항력 있는 임차인의 보증금이 그 동네 전세 시세 대비
# 어느 수준인지 봐야 인수 위험을 가늠할 수 있다.
: "${RTMS_APT_RENT_URL:=https://apis.data.go.kr/1613000/RTMSDataSvcAptRent}"

# apt_rent <법정동코드5자리> <YYYYMM> [numOfRows]
apt_rent() {
  local lawd="${1:?시군구 법정동코드 5자리 필요}" ymd="${2:?거래년월 YYYYMM 필요}"
  local rows="${3:-800}" body
  body=$(_dgk_get "$RTMS_APT_RENT_URL" getRTMSDataSvcAptRent \
          "LAWD_CD=${lawd}" "DEAL_YMD=${ymd}" "pageNo=1" "numOfRows=${rows}") || return 1
  _dgk_check "$body" || return 1
  printf '%s' "$body"
}

# apt_rent_tsv <법정동코드> <YYYYMM>
# 월세가 0 이면 전세다. 보증금·월세는 천단위 쉼표가 박혀 오므로 벗긴다.
apt_rent_tsv() {
  apt_rent "$@" | python3 "$(dirname "${BASH_SOURCE[0]}")/rtms_tsv.py" rent
}

# ── 2) 온비드 부동산 물건목록 ─────────────────────────────────
# onbid_list KEY=VAL ...
# ※ 필수 요청변수 확정 전. 파라미터 없이 호출하면
#   NO_MANDATORY_REQUEST_PARAMETERS_ERROR 가 난다.
onbid_list() {
  local body
  body=$(_dgk_get "$ONBID_LIST_URL" getRlstCltrList2 "pageNo=1" "numOfRows=${ONBID_ROWS:-50}" "$@") || return 1
  _dgk_check "$body" || return 1
  printf '%s' "$body"
}

# ── 3) 온비드 부동산 물건상세 ─────────────────────────────────
onbid_detail() {
  local body
  body=$(_dgk_get "$ONBID_DETAIL_URL" getRlstDtlInf2 "$@") || return 1
  _dgk_check "$body" || return 1
  printf '%s' "$body"
}

# ── 연결 점검 ────────────────────────────────────────────────
dgk_selftest() {
  local ok=0 fail=0
  printf '  %s ... ' "인증키            "
  if _dgk_key >/dev/null 2>&1; then echo "확인됨"; else echo "없음"; return 1; fi
  printf '  %s ... ' "실거래가(수성구 최근월)"
  local _rt=1
  for _ in 1 2 3; do
    if apt_trade 27260 "$(date -d '1 month ago' +%Y%m)" 3 >/dev/null 2>&1; then _rt=0; break; fi
    sleep 2
  done
  if [ "$_rt" -eq 0 ]; then echo "OK"; ok=$((ok+1)); else echo "실패"; fail=$((fail+1)); fi
  for pair in "물건목록:$ONBID_LIST_URL/getRlstCltrList2" "물건상세:$ONBID_DETAIL_URL/getRlstDtlInf2"; do
    printf '  %s ... ' "온비드 ${pair%%:*}(인증)"
    local r=""
    for _ in 1 2 3; do
      r=$(curl -sS --max-time 30 "${pair#*:}?serviceKey=$(_dgk_key)" 2>&1)
      [ -n "$r" ] && break
      sleep 2
    done
    case "$r" in
      *NO_MANDATORY_REQUEST_PARAMETERS*) echo "인증 OK (필수 파라미터 미지정)"; ok=$((ok+1)) ;;
      *SERVICE_KEY_IS_NOT_REGISTERED*)   echo "키 미등록 — 활성화 대기(1~2시간)"; fail=$((fail+1)) ;;
      *SERVICE_ACCESS_DENIED*)           echo "권한 없음 — 활용신청 필요"; fail=$((fail+1)) ;;
      *DEADLINE_HAS_EXPIRED*)            echo "키 사용기한 만료"; fail=$((fail+1)) ;;
      "")                                echo "응답 없음 (네트워크)"; fail=$((fail+1)) ;;
      *)  echo "확인 필요 → $(printf '%s' "$r" | tr -d '\n' | grep -oE '<resultMsg>[^<]*|<errMsg>[^<]*' | head -1 | sed 's/<[^>]*>//')"; fail=$((fail+1)) ;;
    esac
  done
  printf '  %s ... ' "CODEF 경매사건검색  "
  if _codef_creds >/dev/null 2>&1; then
    if _codef_token >/dev/null 2>&1; then echo "토큰 발급 OK"; ok=$((ok+1)); else echo "토큰 발급 실패"; fail=$((fail+1)); fi
  else
    echo "자격증명 없음 (선택)"
  fi
  echo; echo "성공 $ok / 실패 $fail"
  [ "$fail" -eq 0 ]
}

# ══════════════════════════════════════════════════════════════
# CODEF — 대법원 법원경매정보 경매사건검색
# ══════════════════════════════════════════════════════════════
# data.go.kr 이 아니라 CODEF(codef.io)가 대법원 법원경매정보를
# 중계하는 상용 API 입니다. 별도의 CODEF 계정/자격증명이 필요합니다.
#
# 인증 흐름: client_id:client_secret (Basic) → access_token → Bearer
#
# 환경변수:
#   CODEF_CLIENT_ID      CODEF 클라이언트 ID
#   CODEF_CLIENT_SECRET  CODEF 클라이언트 시크릿
#   CODEF_API_BASE       https://development.codef.io (데모, 기본값)
#                        https://api.codef.io         (정식 — 검증 후 전환)
#
# 데모에서 먼저 검증하고 정식으로 넘기는 순서를 지킨다. codef_env 로 현재 환경을
# 확인하고, codef_verify 로 데모 호출이 실제로 파싱되는지 본 뒤 전환한다.

: "${CODEF_API_BASE:=https://development.codef.io}"
: "${CODEF_OAUTH_URL:=https://oauth.codef.io/oauth/token}"
_CODEF_TOKEN_CACHE="${HOME}/.secrets/codef_token"

_codef_creds() {
  if [ -n "${CODEF_CLIENT_ID:-}" ] && [ -n "${CODEF_CLIENT_SECRET:-}" ]; then
    printf '%s:%s' "$CODEF_CLIENT_ID" "$CODEF_CLIENT_SECRET"
  elif [ -r "$HOME/.secrets/codef" ]; then
    tr -d '\n\r' < "$HOME/.secrets/codef"   # 형식: client_id:client_secret
  else
    echo "ERROR: CODEF_CLIENT_ID / CODEF_CLIENT_SECRET 가 없습니다." >&2
    echo "       환경변수에 넣거나 ~/.secrets/codef 에 'client_id:client_secret' 형식으로 저장하세요." >&2
    return 1
  fi
}

# 액세스 토큰 발급(캐시 사용). CODEF 토큰은 기본 만료가 길지만 안전하게 1시간만 재사용.
_codef_token() {
  if [ -r "$_CODEF_TOKEN_CACHE" ]; then
    local age; age=$(( $(date +%s) - $(stat -c %Y "$_CODEF_TOKEN_CACHE" 2>/dev/null || echo 0) ))
    if [ "$age" -lt 3600 ]; then cat "$_CODEF_TOKEN_CACHE"; return 0; fi
  fi
  local creds b64 resp tok
  creds="$(_codef_creds)" || return 1
  b64=$(printf '%s' "$creds" | base64 -w0)
  resp=$(curl -sS --max-time 30 -X POST \
          "${CODEF_OAUTH_URL}?grant_type=client_credentials&scope=read" \
          -H "Authorization: Basic ${b64}" \
          -H "Content-Type: application/x-www-form-urlencoded") || return 1
  tok=$(printf '%s' "$resp" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null)
  if [ -z "$tok" ]; then
    echo "ERROR: 토큰 발급 실패 → $(printf '%s' "$resp" | head -c 300)" >&2
    return 1
  fi
  mkdir -p "$HOME/.secrets"; umask 077
  printf '%s' "$tok" > "$_CODEF_TOKEN_CACHE"
  printf '%s' "$tok"
}


# ── 호출 예산 가드 (CODEF 유료 과금 대비) ────────────────────
# 주 단위(ISO week)로 호출 수를 세고 상한을 넘으면 거부합니다.
# 상한은 CODEF_MAX_CALLS 로 조절 (기본 15회/주).
: "${CODEF_MAX_CALLS:=15}"
_CODEF_BUDGET_FILE="${HOME}/.secrets/codef_calls"
# 데모 검증을 통과한 시각을 기록한다. 이 표식이 없으면 정식 호출을 막는다.
_CODEF_VERIFIED_FILE="${HOME}/.secrets/codef_verified"
# 일일 호출 카운터. CODEF 는 계정별로 하루 호출 수를 제한한다(데모 기준 100건).
# 한도를 넘기면 CF-00012 를 돌려주는데, 그 응답도 호출 1건으로 소모되므로
# 스스로 세어서 미리 멈춘다.
_CODEF_DAILY_FILE="${HOME}/.secrets/codef_daily"
: "${CODEF_MAX_DAILY:=100}"

_codef_week() { date +%G-W%V; }

codef_budget_status() {
  local wk cur
  wk=$(_codef_week)
  cur=$(_codef_budget_count)
  echo "이번 주($wk) CODEF 호출: ${cur}/${CODEF_MAX_CALLS}회  (남음 $((CODEF_MAX_CALLS-cur)))"
}

_codef_budget_count() {
  local wk line
  wk=$(_codef_week)
  if [ -r "$_CODEF_BUDGET_FILE" ]; then
    line=$(cat "$_CODEF_BUDGET_FILE")
    case "$line" in
      "$wk "*) printf '%s' "${line#"$wk "}"; return 0 ;;
    esac
  fi
  printf '0'
}

# 정식 엔드포인트일 때만 true. 데모 호출은 과금이 없으므로 예산에서 제외한다.
_codef_is_paid() { case "$CODEF_API_BASE" in *api.codef.io*) return 0 ;; *) return 1 ;; esac; }

_codef_budget_bump() {
  _codef_is_paid || return 0
  local wk cur
  wk=$(_codef_week); cur=$(_codef_budget_count)
  mkdir -p "$HOME/.secrets"; umask 077
  printf '%s %s' "$wk" "$((cur+1))" > "$_CODEF_BUDGET_FILE"
}

# 주간 카운터를 강제로 비웁니다(수동 리셋용).
codef_budget_reset() {
  mkdir -p "$HOME/.secrets"; umask 077
  printf '%s 0' "$(_codef_week)" > "$_CODEF_BUDGET_FILE"
  echo "이번 주 CODEF 호출 카운터를 0으로 초기화했습니다."
}

# codef_auction <법원명> <사건년도> <사건번호>
#   예: codef_auction 대구지방법원 2025 8313
# ※ 법원명은 CODEF가 정한 표기를 그대로 써야 합니다("대구지방법원", "서울중앙지방법원" 등).
codef_auction() {
  local court="${1:?법원명 필요 (예: 대구지방법원)}"
  local year="${2:?사건 년도 4자리 필요 (예: 2025)}"
  local num="${3:?사건번호 필요 (예: 8313)}"
  local tok body used
  if _codef_is_paid && ! codef_is_verified; then
    echo "중단: 데모 검증을 아직 통과하지 않았습니다. 정식 호출을 막습니다." >&2
    echo "      CODEF_API_BASE=https://development.codef.io codef_verify 를 먼저 실행하십시오." >&2
    return 3
  fi
  local today_used; today_used=$(_codef_daily_count)
  if [ "$today_used" -ge "$CODEF_MAX_DAILY" ]; then
    echo "중단: 오늘 CODEF 호출 한도 ${CODEF_MAX_DAILY}건을 모두 썼습니다 (현재 ${today_used}건)." >&2
    echo "      내일 자동으로 초기화됩니다. 강제로 비우려면 codef_daily_reset 을 쓰세요." >&2
    return 4
  fi
  used=$(_codef_budget_count)
  if _codef_is_paid && [ "$used" -ge "$CODEF_MAX_CALLS" ]; then
    echo "중단: 이번 주 CODEF 호출 한도 ${CODEF_MAX_CALLS}회를 모두 썼습니다 (현재 ${used}회)." >&2
    echo "      한도를 올리려면 CODEF_MAX_CALLS 를 조정하고, 강제로 비우려면 codef_budget_reset 을 쓰세요." >&2
    return 2
  fi
  tok="$(_codef_token)" || return 1
  _codef_budget_bump
  _codef_daily_bump
  body=$(python3 -c '
import json,sys
print(json.dumps({"organization":"0004","courtName":sys.argv[1],
                  "caseNumberYear":sys.argv[2],"caseNumberNumber":sys.argv[3]},
                 ensure_ascii=False))' "$court" "$year" "$num")
  local resp
  resp=$(curl -sS --max-time 120 -X POST "${CODEF_API_BASE}/v1/kr/public/ck/auction-events/search" \
       -H "Authorization: Bearer ${tok}" \
       -H "Content-Type: application/json;charset=UTF-8" \
       --data-raw "$body")
  # 서버가 한도 초과를 알려오면 남은 호출을 낭비하지 않도록 즉시 오늘치를 막는다.
  case "$resp" in
    *CF-00012*|*%22CF-00012%22*)
      _codef_daily_exhaust
      echo "CODEF 일일 한도 초과 — 오늘 남은 호출을 중단합니다. 내일 재시도하십시오." >&2
      ;;
  esac
  printf '%s' "$resp" \
  | python3 -c '
import sys,json,urllib.parse
raw=sys.stdin.read().strip()
# CODEF 응답은 URL 인코딩된 JSON 으로 오는 경우가 있어 두 경우 모두 처리
for cand in (raw, urllib.parse.unquote_plus(raw)):
    try:
        print(json.dumps(json.loads(cand), ensure_ascii=False, indent=2)); break
    except Exception: continue
else:
    print(raw[:1500], file=sys.stderr); sys.exit("응답 파싱 실패")
'
}

# codef_auction_summary <법원명> <년도> <번호>
#   물건내역·기일내역·당사자를 사람이 읽기 쉬운 형태로 출력.
#   응답이 평문 JSON 일 때와 URL 인코딩일 때가 섞여 오므로 파싱은
#   scripts/codef_summary.py 에 맡긴다.
codef_auction_summary() {
  local here; here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  codef_auction "$@" | python3 "$here/codef_summary.py"
}

# CODEF 일일 한도는 KST 자정에 초기화된다. 컨테이너 시계는 UTC이므로
# date +%F 를 그대로 쓰면 08:00 KST(=전날 23:00 UTC) 실행 때 전날 카운터를
# 그대로 읽어 호출을 전부 막아버린다. 반드시 KST 기준 날짜로 키를 잡는다.
_codef_today() { TZ=Asia/Seoul date +%F; }

_codef_daily_count() {
  local today line
  today=$(_codef_today)
  if [ -r "$_CODEF_DAILY_FILE" ]; then
    line=$(cat "$_CODEF_DAILY_FILE")
    case "$line" in
      "$today "*) printf '%s' "${line#"$today "}"; return 0 ;;
    esac
  fi
  printf '0'
}

_codef_daily_bump() {
  local today cur
  today=$(_codef_today); cur=$(_codef_daily_count)
  mkdir -p "$HOME/.secrets"; umask 077
  printf '%s %s' "$today" "$((cur+1))" > "$_CODEF_DAILY_FILE"
}

# 서버가 한도 초과를 알려오면 남은 호출을 시도하지 않도록 오늘치를 소진 처리한다.
_codef_daily_exhaust() {
  mkdir -p "$HOME/.secrets"; umask 077
  printf '%s %s' "$(_codef_today)" "$CODEF_MAX_DAILY" > "$_CODEF_DAILY_FILE"
}

codef_daily_status() {
  local cur; cur=$(_codef_daily_count)
  echo "오늘($(_codef_today)) CODEF 호출: ${cur}/${CODEF_MAX_DAILY}건  (남음 $((CODEF_MAX_DAILY-cur)))"
}

codef_daily_reset() {
  mkdir -p "$HOME/.secrets"; umask 077
  printf '%s 0' "$(_codef_today)" > "$_CODEF_DAILY_FILE"
  echo "오늘 CODEF 호출 카운터를 0으로 초기화했습니다."
}

# 조회 우선순위. 호출 한도가 있으므로 관심 지역부터 채운다.
# 대구권(대구지방법원 + 서부지원 + 경북 관할)을 최우선으로 둔다.
CODEF_PRIORITY_COURTS="${CODEF_PRIORITY_COURTS:-대구지방법원 대구서부지원 경주지원 김천지원 상주지원 안동지원 영덕지원 의성지원 포항지원}"

# 사건 목록(법원|년도|번호 형식)을 우선순위 순으로 정렬해 표준출력으로 낸다.
#   codef_prioritize < cases.txt
# ── 사건번호 전방 스캔 (신건 발굴 실험) ──────────────────
# CODEF 경매사건검색은 사건번호를 알아야만 답한다. 지역·기일로 목록을 뽑을 수 없다.
# 다만 사건번호는 접수 순 연번이라, 이미 아는 최댓값 위쪽은 새로 접수된 사건이다.
# 그 구간을 훑어 적중률을 재는 실험용 함수다.
#
#   codef_scan_forward <법원> <년도> <시작번호> <개수> [출력파일]
#
# 주의: 한 번호당 1콜이다. 일일 100건 한도를 그대로 쓰므로 개수를 크게 잡지 마라.
codef_scan_forward() {
  local court="${1:?법원명}" year="${2:?년도}" start="${3:?시작번호}" n="${4:?개수}"
  local out="${5:-$HOME/.secrets/codef_scan_${year}_$(date +%s).jsonl}"
  local i num resp code hit=0 miss=0 err=0

  echo "── 전방 스캔: ${court} ${year}타경 ${start} 부터 ${n}개 ──"
  echo "   결과 파일: $out"
  : > "$out"

  for i in $(seq 0 $((n-1))); do
    num=$((start+i))
    resp=$(codef_auction "$court" "$year" "$num" 2>/dev/null)
    if [ -z "$resp" ]; then
      echo "  ${num}  중단 (한도 또는 호출 실패)"; err=$((err+1)); break
    fi
    # 결과코드와 데이터 유무로 판정한다. '없는 사건'의 응답 형태는 아직 모르므로
    # 코드를 그대로 기록해 두고 나중에 분류한다.
    code=$(printf '%s' "$resp" | python3 -c '
import sys,json
try: d=json.load(sys.stdin)
except Exception: print("PARSE_FAIL"); raise SystemExit
print(d.get("result",{}).get("code",""))')
    printf '%s\n' "$(printf '%s' "$resp" | python3 -c '
import sys,json
raw=sys.stdin.read()
try: d=json.loads(raw)
except Exception: d={}
data=d.get("data") or {}
if isinstance(data,list): data=data[0] if data else {}
print(json.dumps({
  "num": '"$num"',
  "code": d.get("result",{}).get("code",""),
  "msg": d.get("result",{}).get("message",""),
  "caseNo": data.get("resCaseNumber",""),
  "caseName": data.get("resCaseName",""),
  "final": data.get("resFinalResult",""),
  "receipt": data.get("resReceiptDate",""),
  "claim": data.get("resClaimAmt",""),
  "merger": data.get("resMerger",""),
  "related": [c.get("resCaseNumber","") for c in (data.get("resInvolvedCaseList") or []) if c.get("resCaseNumber")],
  "items": [{"no":it.get("resNumber",""),"use":it.get("resUseType",""),
             "amt":it.get("resAmount",""),"val":it.get("resValuationAmt",""),
             "state":it.get("resState",""),
             "addr":(it.get("resDetailList") or [{}])[0].get("resAddress","")}
            for it in (data.get("resProductList") or [])],
}, ensure_ascii=False))')" >> "$out"

    case "$code" in
      CF-00012) echo "  ${num}  일일 한도 초과 — 중단"; break ;;
    esac
    if printf '%s' "$resp" | grep -q '"resCaseNumber": *"[^"]'; then
      hit=$((hit+1)); echo "  ${num}  ✅ 사건 있음"
    else
      miss=$((miss+1)); echo "  ${num}  ·  없음 (${code})"
    fi
  done

  local tried=$((hit+miss))
  echo
  echo "── 결과 ──"
  echo "  조회 ${tried}건 · 적중 ${hit} · 없음 ${miss} · 오류 ${err}"
  [ "$tried" -gt 0 ] && echo "  적중률 $(( hit*100/tried ))%"
  echo "  오늘 사용량: $(_codef_daily_count)/${CODEF_MAX_DAILY}"
}

codef_prioritize() {
  local prio="$CODEF_PRIORITY_COURTS"
  awk -v prio="$prio" -F'|' '
    BEGIN { n=split(prio, P, " "); for (i=1; i<=n; i++) rank[P[i]] = i }
    { r = ($1 in rank) ? rank[$1] : 999; printf "%03d\t%s\n", r, $0 }
  ' | sort -k1,1n -s | cut -f2-
}

# 데모 검증을 통과한 적이 있는지.
codef_is_verified() { [ -s "$_CODEF_VERIFIED_FILE" ]; }

# 지금 어느 환경을 쓰고 있는지 보여준다.
codef_env() {
  if _codef_is_paid; then
    echo "환경: 정식 (api.codef.io) — 호출당 과금됨"
    codef_budget_status
  else
    echo "환경: 데모 (development.codef.io) — 과금 없음, 예산 카운터도 올라가지 않음"
    echo "정식 전환: 환경변수 CODEF_API_BASE=https://api.codef.io"
  fi
  codef_daily_status
  if codef_is_verified; then
    echo "데모 검증: 통과 ($(cat "$_CODEF_VERIFIED_FILE"))"
  else
    echo "데모 검증: 미완료 — codef_verify 를 먼저 실행하십시오"
  fi
}

# 데모에서 한 건 호출해 응답이 실제로 파싱되는지 확인한다.
# 인자를 주지 않으면 기본 사건으로 시험한다.
codef_verify() {
  local court="${1:-대구지방법원}" year="${2:-2025}" num="${3:-8313}"
  echo "── CODEF 연동 검증 ──"
  codef_env; echo
  if _codef_is_paid; then
    echo "주의: 지금 정식 환경입니다. 검증은 데모에서 먼저 하십시오." >&2
    echo "      CODEF_API_BASE=https://development.codef.io codef_verify" >&2
    return 2
  fi
  _codef_creds >/dev/null || return 1
  echo "토큰 발급 시도..."
  _codef_token >/dev/null || return 1
  echo "토큰 발급 OK"; echo
  echo "경매사건검색 호출: $court $year 타경 $num"
  if codef_auction_summary "$court" "$year" "$num"; then
    mkdir -p "$HOME/.secrets"; umask 077
    date -u '+%Y-%m-%dT%H:%M:%SZ' > "$_CODEF_VERIFIED_FILE"
    echo
    echo "✅ 데모 검증 통과. 정식으로 넘기려면 환경변수에 아래를 넣으십시오."
    echo "   CODEF_API_BASE=https://api.codef.io"
  else
    echo "❌ 데모 호출 실패 — 정식으로 넘기지 마십시오." >&2
    return 1
  fi
}
