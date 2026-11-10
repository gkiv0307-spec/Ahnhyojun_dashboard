#!/usr/bin/env bash
# 인증키를 ~/.secrets/ 에 안전하게 넣는다.
#
#   scripts/put_secret.sh datagokr           # 값은 stdin 으로 (화면에 안 남는다)
#   scripts/put_secret.sh datagokr --force   # 기존 값을 덮어쓸 때
#
# **기존 파일이 있으면 기본적으로 거부한다.** 2026-08-26 에 건축물대장 키를
# 실거래가 키 자리에 그대로 덮어써서 실거래가 키를 잃었다. data.go.kr 인증키는
# 계정마다 다르고 서비스별로 활용신청이 따로라, 새 키를 받았다고 기존 자리에
# 쓰면 멀쩡히 돌던 서비스가 죽는다.
#
# 덮어쓸 때는 이전 값을 .bak 으로 남긴다. 값은 절대 출력하지 않고 지문만 찍는다.
set -euo pipefail
name="${1:?사용법: put_secret.sh <이름> [--force]}"
force="${2:-}"
dir="$HOME/.secrets"; f="$dir/$name"
mkdir -p "$dir"; umask 077

new=$(cat); new="${new//[$'\n\r']}"
[ -z "$new" ] && { echo "빈 값은 저장하지 않습니다." >&2; exit 1; }
fp() { printf '%s' "$1" | sha256sum | cut -c1-12; }

if [ -s "$f" ]; then
  old=$(tr -d '\n\r' < "$f")
  if [ "$old" = "$new" ]; then
    echo "이미 같은 값입니다 (지문 $(fp "$new")). 변경 없음."; exit 0
  fi
  if [ "$force" != "--force" ]; then
    echo "거부: $f 에 이미 다른 값이 있습니다." >&2
    echo "      기존 지문 $(fp "$old") · 새 값 지문 $(fp "$new")" >&2
    echo "      다른 서비스의 키일 수 있습니다. 서비스별로 파일을 나누십시오" >&2
    echo "      (예: ~/.secrets/${name}-bld). 정말 바꾸려면 --force 를 주십시오." >&2
    exit 2
  fi
  cp -p "$f" "$f.bak"; chmod 600 "$f.bak"
  echo "기존 값을 $f.bak 으로 백업했습니다 (지문 $(fp "$old"))."
fi

printf '%s' "$new" > "$f"; chmod 600 "$f"
echo "저장 완료: $f (지문 $(fp "$new"), ${#new}자)"
