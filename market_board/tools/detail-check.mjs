// 빌드한 현황판에서 물건 상세 화면을 열어 앞부분 글자를 찍는다(발행 전 눈 확인용).
// 사용: node tools/detail-check.mjs <절대경로/auction-board.html> '법원|사건번호|물건번호' ...
// 예:   node tools/detail-check.mjs $PWD/auction-board.html '대구지방법원|2025타경10028|1'
// 원래 세션 스크래치패드(d1003/detail.mjs)에만 있던 도우미를 옮긴 것이다.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const { chromium } = pw;
const b = await chromium.launch(); const p = await b.newPage();
await p.goto('file://' + process.argv[2], {waitUntil:'domcontentloaded'});
await p.waitForTimeout(1500);
for (const k of process.argv.slice(3)) {
  const t = await p.evaluate(k => { document.getElementById('guide')?.remove(); openDetail(k); return document.querySelector('#view').innerText; }, k);
  console.log('=== '+k+'\n'+t.slice(0,700).replace(/\n+/g,' | '));
}
await b.close();
