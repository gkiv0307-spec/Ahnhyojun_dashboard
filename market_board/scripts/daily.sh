#!/usr/bin/env bash
# 매일 한 번 도는 갱신 루틴. 새벽 6시(KST)에 트리거가 부른다.
#
#   bash scripts/daily.sh            # 전체
#   bash scripts/daily.sh --check    # 인증키가 보이는지만 확인하고 끝낸다
#
# 순서가 중요하다. CODEF 가 용도·특이사항·유찰횟수를 새로 채우므로,
# 시세 매칭(attach_rtms)과 선별 등급(screen_clean)은 반드시 그 뒤에 온다.
#
# **키가 없으면 그 단계를 건너뛰고 그렇다고 말한다.** 원격 세션은 컨테이너가
# 매번 새로 뜨기 때문에 ~/.secrets 가 없을 수 있다. 그때 조용히 빈 결과를
# 써버리면 멀쩡하던 데이터가 지워진다 — 건너뛰는 편이 낫다.
set -uo pipefail
cd "$(dirname "$0")/.."
ok=(); skip=()
mode="${1:-}"

have_dgk() { [ -n "${DATA_GO_KR_KEY:-}" ] || [ -r "$HOME/.secrets/datagokr" ]; }
have_codef() { { [ -n "${CODEF_CLIENT_ID:-}" ] && [ -n "${CODEF_CLIENT_SECRET:-}" ]; } \
                 || [ -r "$HOME/.secrets/codef" ]; }

# 어디서 왔는지까지 말해 준다. '있다/없다' 만으로는 환경변수를 넣어야 하는지
# 컨테이너 홈이 살아 있는 것인지 구분이 안 된다. **값은 절대 찍지 않는다.**
where() {  # where <환경변수명> <파일경로>
  if [ -n "${!1:-}" ]; then echo "환경변수 $1"
  elif [ -r "$2" ]; then echo "파일 $2 ($(stat -c %y "$2" | cut -d' ' -f1) 자)"
  else echo "없음"; fi
}

echo "══ 일일 갱신 $(TZ=Asia/Seoul date '+%F %H:%M KST') ══"
echo "── 인증키 점검 ──"
echo "  data.go.kr : $(where DATA_GO_KR_KEY  "$HOME/.secrets/datagokr")"
echo "  CODEF      : $(where CODEF_CLIENT_ID "$HOME/.secrets/codef")"
echo "  건축물대장 : $(where DATA_GO_KR_KEY_BLD "$HOME/.secrets/datagokr-bld")"
echo "  네이버검색 : $(where NAVER_APIHUB_KEY_ID "$HOME/.secrets/naver") (없으면 NAVER_CLIENT_ID 확인: $(where NAVER_CLIENT_ID "$HOME/.secrets/naver"))"
echo "  컨테이너   : 부팅 $(uptime -s) · 홈 $HOME"
if [ "$mode" = "--check" ]; then
  echo
  if have_dgk && have_codef; then
    echo "✅ 두 키 모두 보입니다. 전체 실행이 가능합니다."
  else
    echo "⚠ 키가 빠져 있습니다. 전체 실행하면 해당 단계는 건너뜁니다."
  fi
  exit 0
fi

if have_codef; then
  echo "── CODEF 대조 ──"
  python3 scripts/codef_batch.py --limit 100 || true
  python3 scripts/apply_codef.py /tmp/na/raw || true
  ok+=("CODEF 대조")
else
  echo "── CODEF 대조 건너뜀 — 자격증명 없음 (~/.secrets/codef 또는 CODEF_CLIENT_ID/SECRET) ──"
  skip+=("CODEF 대조")
fi

# 사용자 PC 크롬으로 법원경매정보를 읽어 둔 결과(data/court-in/)를 반영한다.
# 조회는 PC 세션이 하고, 여기서는 아직 반영 안 한 파일만 읽는다.
echo "── 법원 조회 결과 반영 ──"
# 대시보드 아침 루틴이 법원에서 읽은 결과(_results → data/dash-in/)를 court-in 형식으로 바꾼다
# (2026-09-30 사용자 지시 "법원결과도 현황판에 자동 반영되게 해줘").
python3 scripts/dash_court.py || true
python3 scripts/apply_court.py --write || true

# CODEF 가 없어도 돈다(2026-09-25 수정). 예전엔 CODEF 블록 안에 있어서, CODEF 가
# 끝난 뒤 색인 재확인(index_recheck.py)이 바꾼 매각·유찰이 대시보드로 안 갔다.
python3 scripts/mask_names.py || true
# 대시보드에 보낸 물건 중 유찰·변경·매각·종료된 것의 갱신 파일을 만든다.
# 파일은 data/dash-out/ 에 남고, Google Drive 에 올리는 건 세션이 한다
# (서버에 Drive 자격증명이 없다). 올리지 않으면 대시보드는 안 바뀐다.
echo "── 대시보드 변동 ──"
python3 scripts/dash_sync.py --write || true

# 실거래가는 월 단위로 쌓인다 — gen 이 7일 안이면 다시 모으지 않는다(1,008콜 · 20분).
# 2026-09-13 까지는 이 조건이 없어 매일 통째로 다시 받고 있었다.
rtms_fresh() { python3 - <<'PY'
import json,datetime,sys
try: g=json.load(open('data/rtms.json')).get('gen','')
except Exception: sys.exit(1)
try: d=datetime.date.fromisoformat(g[:10])
except Exception: sys.exit(1)
sys.exit(0 if (datetime.date.today()-d).days<=7 else 1)
PY
}
if have_dgk && rtms_fresh; then
  echo "── 실거래가 수집 건너뜀 — rtms.json 이 7일 이내 ──"
  skip+=("실거래가 수집(7일 이내)")
elif have_dgk; then
  echo "── 실거래가 수집 ──"
  if python3 scripts/fetch_rtms.py --months 12 --jobs 6; then
    ok+=("실거래가 수집")
  else
    echo "!! 실거래가 수집 실패 — 기존 rtms.json 을 그대로 둡니다"
    skip+=("실거래가 수집(실패)")
  fi
else
  echo "── 실거래가 수집 건너뜀 — data.go.kr 인증키 없음 (~/.secrets/datagokr 또는 DATA_GO_KR_KEY) ──"
  skip+=("실거래가 수집")
fi

echo "── 시세 매칭 · 선별 · 빌드 ──"
python3 scripts/attach_rtms.py && ok+=("시세 매칭")
python3 scripts/screen_clean.py && ok+=("선별 등급")
# 대장 단지 표시(⭐). 선별 등급 뒤에 와야 --auto 가 오늘 등급으로 고른다.
python3 scripts/mark_landmarks.py && ok+=("대장 단지 표시")
# 대장 단지 중 권리 자국 없는(법원 대조 · clean) 진행중 물건을 대시보드에 자동 등록.
# 파일은 data/dash-out/dash-auto-<날짜>.json — Drive 에 올리는 건 세션이 한다.
python3 scripts/dash_sync.py --auto --write || true
# 상세 화면(경매지)은 data/detail.json 에서 읽는다. 이걸 안 돌리면 CODEF 로 받아둔
# 사건도 '상세 미수집' 으로 나온다 — 2026-09-12 에 928건 중 375건만 들어 있었다.
python3 scripts/build_detail.py && ok+=("상세 빌드")
bash scripts/build_site.sh && ok+=("사이트 빌드")
# 큐를 마지막에 다시 굽는다. 오늘 대조한 사건이 큐에 남아 있으면 내일 한도를
# 그 사건에 또 쓴다.
python3 scripts/build_queue.py --write && ok+=("대기열 재생성")

echo
echo "══ 요약 ══"
echo "  한 것   : ${ok[*]:-없음}"
echo "  건너뜀  : ${skip[*]:-없음}"
python3 - <<'PY'
import json
D = json.load(open('data/data.json'))
apt = [x for x in D if x.get('ut') == '아파트']
live = [x for x in apt if x.get('st') == '진행중']
print(f"  물건 {len(D)}건 · 아파트 {len(apt)} · 진행중 아파트 {len(live)}")
print(f"  권리 자국 없음 {sum(1 for x in apt if x.get('screen')=='clean')}건"
      f" (그중 진행중 {sum(1 for x in live if x.get('screen')=='clean')})")
print(f"  법원 대조 완료 {sum(1 for x in D if x.get('verified'))}건 /"
      f" 미대조 {sum(1 for x in D if not x.get('verified'))}건")
PY
echo
echo "  ※ 커밋·푸시·아티팩트 배포는 사람이 확인한 뒤에 합니다."
