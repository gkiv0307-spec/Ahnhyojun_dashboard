// 블로그컨텐츠 탭이 뽑는 후보 목록을 그대로 꺼낸다.
//
//   node scripts/blog_extract.mjs [기일여유일수] > out.json
//
// **판정 로직을 파이썬으로 옮겨 적지 마라.** 결격 사유(blogFaults/gmFaults)와
// 권역·용도 판정은 site-pages.js 안에 있고 계속 바뀐다. 옮겨 적으면 화면과
// 엑셀이 서로 다른 답을 내놓는다. 그래서 빌드된 페이지를 실제로 열어
// blogPool() 을 호출한다.
//
// 주의: 페이지의 TODAY 는 브라우저 로컬 날짜다. 이 컨테이너는 UTC 라
// KST 보다 하루 뒤처질 수 있다. 날짜 경계는 받는 쪽(blog_xlsx.py)에서
// KST 로 다시 자른다.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const lead = Number(process.argv[2] || 15);
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
// 구글 폰트가 이 컨테이너 프록시에서 막혀 load 가 안 끝난다. file: 만 통과시킨다.
await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('file://' + process.cwd() + '/auction-board.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(700);

const out = await p.evaluate(lead => {
  BLOG.lead = lead; BLOG.use = '아파트'; BLOG.reg = '대구권'; BLOG.src = '전체';
  const rows = blogPool().map(x => ({
    faults: bfaults(x), gm: isGm(x),
    a1: (x.a1 || '').trim(), a2: (x.a2 || '').trim(),
    ct: x.ct || x.org || '', caNo: x.caNo || x.mg || '', ino: x.ino ?? '',
    addr: x.a || x.nm || '', nm: (x.br?.bld || x.tx?.nm || x.nm || ''),
    d: x.d || x.end || '',
    ap: x.ap ?? null, mn: x.mn ?? null, rt: x.rt ?? null, f: x.f ?? null,
    ar: (areaOf(x) || {}).txt || '', arSrc: (areaOf(x) || {}).src || '',
    mkT: x.mk?.t?.med ?? null, mkN: x.mk?.t?.n ?? null, mkNm: x.mk?.nm || '',
    arGuess: !!x.mk?.arGuess, gap: x.mk?.gap ?? null,
    screen: x.screen || '', sp: (x.sp || []).join('·'), ut: x.ut || '',
    verified: !!x.verified,
  }));
  return { lead, total: rows.length, today: TODAY, rows };
}, lead);

console.log(JSON.stringify({ ...out, errs }));
await b.close();
