#!/usr/bin/env bash
# 현황판 HTML 을 만든다.  scripts/build_site.sh [출력경로]
# 데이터는 저장소의 data/*.json 이 정본이다. 스크래치패드는 휘발성이라
# 컨테이너가 회수되면 사라진다 — 매 실행 끝에 data/ 를 커밋해 둘 것.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="${1:-$here/auction-board.html}"
node -e '
const fs=require("fs"), r=p=>fs.readFileSync(p,"utf8"), root=process.argv[1];
const stamp=new Date(Date.now()+9*3600e3).toISOString().slice(0,16).replace("T"," ")+" KST";
let t=r(root+"/site-template.html");
// 페이지 렌더러를 **먼저** 끼운다. __BDONE__ 처럼 site-pages.js 안에 들어 있는
// 자리표시자는 이걸 뒤로 미루면 영영 치환되지 않는다.
t=t.replace(/const STAMP = .[^\x27]*.;/,"const STAMP = \x27"+stamp+"\x27;")
   .replace("__PAGES__",()=>r(root+"/site-pages.js"));
for(const [ph,f] of [["__DATA__","data.json"],["__APTS__","apts.json"],["__NEWS__","news.json"],["__DETAIL__","detail.json"],["__ONBID__","onbid.json"],["__CARS__","cars.json"],["__BDONE__","bdone.json"]])
  t=t.replace(ph,()=>JSON.stringify(JSON.parse(r(root+"/data/"+f))));
const left=t.match(/__[A-Z]+__/g);
if(left) throw new Error("미치환 플레이스홀더: "+left);
fs.writeFileSync(process.argv[2],t);
console.error("생성 "+(t.length/1024|0)+"KB · "+stamp);
' "$here" "$out"
