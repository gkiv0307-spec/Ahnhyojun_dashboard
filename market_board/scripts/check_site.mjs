// 빌드된 auction-board.html 을 브라우저로 열어 11개 탭 × 밝음/어두움 × 1280/390 을
// 훑는다. 커밋 전에 돌린다.
//
//   node scripts/check_site.mjs
//
// 두 가지가 늘 발목을 잡았다.
//  1) 첫 방문에는 안내 팝업이 떠서 탭을 가린다. 먼저 닫아야 탭이 눌린다 —
//     안 닫고 누르면 11개 탭이 전부 '클릭 실패' 로 나온다(버그가 아니다).
//  2) 구글 폰트 요청이 이 컨테이너 프록시에서 막혀 load 이벤트가 안 끝난다.
//     file: 이 아닌 요청은 통째로 막고 domcontentloaded 로 기다린다.
//     그래서 'Failed to load resource: net::ERR_FAILED' 는 정상이다.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const TABS = ['home','search','upcoming','calendar','map','apt','wiki','news','blog','onbid','car'];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errs = [];
for (const [w,h,label] of [[1280,900,'1280'],[390,844,'390']]) {
  for (const scheme of ['light','dark']) {
    const ctx = await b.newContext({ viewport:{width:w,height:h}, colorScheme:scheme });
    // 외부 폰트·리소스는 프록시에서 막혀 load 가 안 끝난다. 통째로 차단한다.
    await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`${label}/${scheme} JS: ${e.message}`));
    p.on('console', m => { if (m.type()==='error') errs.push(`${label}/${scheme} console: ${m.text().slice(0,120)}`); });
    await p.goto('file://' + process.cwd() + '/auction-board.html', {waitUntil:'domcontentloaded'});
    await p.waitForTimeout(600);
    // 처음 온 사람에게는 안내 팝업이 먼저 뜬다. 닫고 나서 탭을 만진다.
    const opened = await p.evaluate(()=>{const e=document.getElementById('guide');return e && !e.hidden;});
    if (!opened) errs.push(`${label}/${scheme} 첫 방문 안내 팝업이 안 떴다`);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
    if (await p.evaluate(()=>{const e=document.getElementById('guide');return e && !e.hidden;}))
      errs.push(`${label}/${scheme} 안내 팝업이 Esc 로 안 닫힌다`);
    for (const t of TABS) {
      const el = await p.$(`.tab[data-p="${t}"]`);
      if (!el) { errs.push(`${label}/${scheme} 탭 없음: ${t}`); continue; }
      await el.click({timeout:5000}).catch(()=>errs.push(`${label}/${scheme} ${t} 클릭 실패`));
      await p.waitForTimeout(200);
      const txt = await p.evaluate(()=> (document.getElementById('view')||{}).innerText || '');
      if (txt.trim().length < 30) errs.push(`${label}/${scheme} ${t} 본문 비었음 (${txt.trim().length}자)`);
      const ow = await p.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (ow > 2) errs.push(`${label}/${scheme} ${t} 가로 스크롤 ${ow}px`);
    }
    // 안내 팝업
    // 사용법 단추로 다시 열리는지
    const g = await p.$('#help-open');
    if (!g) errs.push(`${label}/${scheme} 사용법 단추 없음`);
    else { await g.click({timeout:5000}).catch(()=>errs.push(`${label}/${scheme} 사용법 단추 클릭 실패`));
      await p.waitForTimeout(250);
      const vis = await p.evaluate(()=>{const e=document.getElementById('guide');return e && !e.hidden;});
      if (!vis) errs.push(`${label}/${scheme} 사용법 단추로 안 열림`); }
    await ctx.close();
  }
}
await b.close();
console.log(errs.length ? errs.join('\n') : '✅ 이상 없음');
