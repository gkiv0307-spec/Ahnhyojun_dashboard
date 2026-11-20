#!/usr/bin/env node
// 위하고 수신결재함을 읽어 이체관리 시트(Apps Script 웹앱)로 보낸다.
//
//   node sync.js login      처음 1회: 브라우저가 뜨면 직접 로그인(2단계 인증 포함) 후 창 닫기
//   node sync.js inspect    화면 구조 확인용: 목록·첫 문서의 스크린샷과 글자를 debug/ 에 저장
//   node sync.js run        미리보기(시트에 쓰지 않음)
//   node sync.js run --apply  실제로 시트에 입력
//
// 비밀번호는 저장하지 않는다. 로그인 상태(쿠키)만 wehago-profile/ 폴더에 남는다.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const { parseDocument, labelValue, normLines } = require('./lib/parse');

const ROOT = __dirname;
const PROFILE = path.join(ROOT, 'wehago-profile');
const cfg = loadConfig();

function loadConfig() {
  const p = path.join(ROOT, 'config.json');
  if (!fs.existsSync(p)) {
    console.error('config.json 이 없습니다. config.example.json 을 복사해 값을 채워 주세요.');
    process.exit(1);
  }
  const c = JSON.parse(fs.readFileSync(p, 'utf8'));
  c.selectors = Object.assign({ listRow: 'table tbody tr', loginHint: 'input[type="password"]' }, c.selectors);
  c.maxDocs = c.maxDocs || 20;
  return c;
}

async function openBrowser(headless) {
  return chromium.launchPersistentContext(PROFILE, {
    headless,
    viewport: { width: 1400, height: 900 },
    locale: 'ko-KR',
  });
}

async function api(action, body = {}) {
  if (!cfg.webAppUrl || !cfg.token) throw new Error('config.json 의 webAppUrl/token 을 채워 주세요');
  const res = await fetch(cfg.webAppUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: cfg.token, action, ...body }),
    redirect: 'follow',
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`웹앱 응답이 JSON 이 아님 (HTTP ${res.status}): ${text.slice(0, 200)}`); }
  if (!json.ok) throw new Error(`웹앱 오류: ${json.error}`);
  return json;
}

// 페이지 + 모든 iframe 의 글자를 모은다 (위하고 문서 본문이 iframe 안에 있을 수 있음)
async function allText(page) {
  const parts = [];
  for (const f of page.frames()) {
    try { parts.push(await f.evaluate(() => document.body ? document.body.innerText : '')); } catch { /* 접근 불가 frame */ }
  }
  return parts.join('\n');
}

async function gotoList(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForSelector(cfg.selectors.listRow, { timeout: 20000 });
  } catch {
    if (/login/i.test(page.url()) || await page.$(cfg.selectors.loginHint)) {
      throw Object.assign(new Error('로그인이 풀렸습니다. `npm run login` 으로 다시 로그인해 주세요.'), { code: 'LOGIN' });
    }
    // 목록이 비어 있을 수도 있다
    return [];
  }
  await page.waitForTimeout(1500); // 목록이 다 그려질 때까지
  return page.$$(cfg.selectors.listRow);
}

async function rowTexts(page) {
  return page.$$eval(cfg.selectors.listRow, (rows) => rows.map((r) => r.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
}

// 행을 클릭해 문서를 연다. 새 창(팝업)이면 그 창, 아니면 현재 화면에서 글자를 읽는다.
async function readDoc(context, page, rowIndex) {
  const rows = await page.$$(cfg.selectors.listRow);
  const row = rows[rowIndex];
  if (!row) return null;
  const popupP = context.waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await (cfg.selectors.rowClick ? (await row.$(cfg.selectors.rowClick)) || row : row).click();
  const popup = await popupP;
  const target = popup || page;
  await target.waitForLoadState('domcontentloaded').catch(() => {});
  await target.waitForTimeout(cfg.docWaitMs || 3000);
  const text = await allText(target);
  if (popup) await popup.close();
  return text;
}

function docKeyOf(rowText, docText) {
  const fromDoc = labelValue(normLines(docText), ['문서번호']);
  if (fromDoc) return `no:${fromDoc}`;
  if (cfg.docNoPattern) {
    const m = rowText.match(new RegExp(cfg.docNoPattern));
    if (m) return `no:${m[0]}`;
  }
  return 'row:' + crypto.createHash('sha1').update(rowText).digest('hex').slice(0, 16);
}

async function cmdLogin() {
  const ctx = await openBrowser(false);
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(cfg.inboxUrl || 'https://www.wehago.com');
  console.log('브라우저에서 위하고에 로그인한 뒤, 수신결재함이 보이면 브라우저 창을 닫아 주세요.');
  await new Promise((r) => ctx.on('close', r));
  console.log('로그인 상태를 저장했습니다.');
}

async function cmdInspect() {
  const dir = path.join(ROOT, 'debug');
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await openBrowser(false);
  const page = ctx.pages()[0] || await ctx.newPage();
  const rows = await gotoList(page, cfg.inboxUrl);
  await page.screenshot({ path: path.join(dir, '1-목록.png'), fullPage: true });
  fs.writeFileSync(path.join(dir, '1-목록.txt'), await allText(page));
  fs.writeFileSync(path.join(dir, '1-목록.html'), await page.content());
  console.log(`목록 행 선택자 "${cfg.selectors.listRow}" 로 찾은 행: ${rows.length}개`);
  (await rowTexts(page)).slice(0, 5).forEach((t, i) => console.log(`  [${i}] ${t.slice(0, 120)}`));
  if (rows.length) {
    const text = await readDoc(ctx, page, 0);
    fs.writeFileSync(path.join(dir, '2-문서.txt'), text || '');
    await page.screenshot({ path: path.join(dir, '2-문서화면.png'), fullPage: true });
    console.log('\n첫 문서에서 뽑은 값:');
    console.log(parseDocument(text));
  }
  console.log(`\ndebug/ 폴더에 저장했습니다. (계좌·금액이 들어 있으니 외부 공유 시 가려 주세요)`);
  await ctx.close();
}

async function cmdRun(apply) {
  const ctx = await openBrowser(cfg.headless !== false);
  const page = ctx.pages()[0] || await ctx.newPage();
  const dryRun = !apply;
  console.log(dryRun ? '[미리보기] 시트에는 쓰지 않습니다. 실제 입력은 --apply' : '[실제 입력]');
  const stats = { inbox: 0, added: 0, skipped: 0 };
  try {
    const known = new Set((await api('known')).keys);

    // 1) 수신결재함 → 새 건 입력
    const rows = await gotoList(page, cfg.inboxUrl);
    const texts = await rowTexts(page);
    console.log(`수신결재함 ${texts.length}건`);
    stats.inbox = texts.length;
    const items = [];
    for (let i = 0; i < texts.length && items.length < cfg.maxDocs; i++) {
      if (cfg.docNoPattern) {
        const m = texts[i].match(new RegExp(cfg.docNoPattern));
        if (m && known.has(`no:${m[0]}`)) continue; // 문서를 열지 않고 건너뜀
      }
      if (i > 0 || page.url() !== cfg.inboxUrl) await gotoList(page, cfg.inboxUrl);
      const docText = await readDoc(ctx, page, i);
      if (!docText) continue;
      const key = docKeyOf(texts[i], docText);
      if (known.has(key)) continue;
      items.push({ docKey: key, ...parseDocument(docText) });
    }
    if (items.length) {
      const { results } = await api('add', { items, dryRun });
      results.forEach((r) => {
        if (r.result === '입력') stats.added++; else stats.skipped++;
        console.log(`- ${r.result}${r.reason ? ` (${r.reason})` : ''} | ${r.title}`);
        if (r.values) console.log(`    ${r.tab} ${r.row}행: ${r.values[6]} / ${Number(r.values[7]).toLocaleString()} / ${r.values[14]} ${r.values[15]} / 부동산=${r.values[4] || '(빈칸)'} 통장=${r.values[5] || '(빈칸)'}`);
      });
    } else console.log('새로 입력할 건이 없습니다.');

    // 2) 결재내역함 → 증빙수취 '완료' 반영
    if (cfg.doneUrl) {
      await gotoList(page, cfg.doneUrl);
      const doneRows = await rowTexts(page);
      const { results } = await api('markDone', { rows: doneRows, dryRun });
      results.forEach((r) => console.log(`- 증빙수취 ${r.result}${r.reason ? ` (${r.reason})` : ''} | ${r.title}`));
    }
    if (apply) await api('heartbeat', { ok: true, ...stats });
  } catch (e) {
    // 대시보드에 '마지막 실행 실패'를 남긴다(웹앱 자체가 안 되면 남길 수 없음)
    if (apply) await api('heartbeat', { ok: false, ...stats, error: e.message }).catch(() => {});
    throw e;
  } finally {
    await ctx.close();
  }
}

(async () => {
  const [cmd, flag] = process.argv.slice(2);
  try {
    if (cmd === 'login') await cmdLogin();
    else if (cmd === 'inspect') await cmdInspect();
    else if (cmd === 'run') await cmdRun(flag === '--apply');
    else console.log('사용법: node sync.js login | inspect | run [--apply]');
  } catch (e) {
    console.error('실패:', e.message);
    process.exit(e.code === 'LOGIN' ? 2 : 1);
  }
})();
