#!/usr/bin/env bash
# 저장소에 인증키가 섞여 들어갔는지 본다. 커밋 전에 반드시 돌린다.
#
# 패턴을 손으로 적어두면 키가 늘어날 때마다 빠뜨린다. 그래서 ~/.secrets/ 에
# **실제로 들어있는 값**을 읽어 그것으로 훑는다. 새 키를 저장하는 순간
# 자동으로 검사 대상이 된다.
#
# 값 자체는 절대 출력하지 않는다. 지문(sha256 앞 12자)만 찍는다.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sec="$HOME/.secrets"
[ -d "$sec" ] || { echo "~/.secrets 없음 — 검사할 값이 없습니다."; exit 0; }

hit=0 checked=0
for f in "$sec"/*; do
  [ -f "$f" ] || continue
  case "$(basename "$f")" in *.bak|codef_calls|codef_daily|codef_verified) continue ;; esac
  # codef 자격증명은 id:secret 형태다. 조각으로 나눠 각각 훑는다.
  while IFS= read -r v; do
    v="${v//[$'\n\r']}"
    # 시크릿 파일은 끝에 개행이 없다(printf '%s'). 마지막 줄을 흘리지 않도록
    # 위에서 echo 로 개행을 하나 붙였다 — 이걸 빠뜨리면 검사가 조용히 0건이 된다.
    # 8자 미만은 우연히 일치해 오탐만 낸다.
    [ "${#v}" -ge 8 ] || continue
    checked=$((checked+1))
    fp=$(printf '%s' "$v" | sha256sum | cut -c1-12)
    if out=$(grep -rnF --exclude-dir=.git --exclude-dir=node_modules \
                       --exclude-dir=__pycache__ -e "$v" . 2>/dev/null); then
      echo "누출: $(basename "$f") (지문 $fp)"
      # 위치만 찍는다. 일치한 줄을 그대로 뿌리면 이 스캐너가 스스로 키를 흘린다.
      printf '%s\n' "$out" | cut -d: -f1,2 | sed 's/^/    /'
      hit=$((hit+1))
    fi
  done < <(tr ':' '\n' < "$f"; echo)
done

if [ "$hit" -gt 0 ]; then
  echo; echo "❌ ${hit}건 발견. 커밋하지 마십시오."; exit 1
fi
echo "✅ 깨끗함 — ${checked}개 값을 훑었고 저장소에서 하나도 나오지 않았습니다."
