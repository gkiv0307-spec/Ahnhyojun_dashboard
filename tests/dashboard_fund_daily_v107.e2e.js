// v107 자금일보 복사용 게시판 — 메뉴·기본 날짜·행 순서·사유/구분 기본값·빈칸 표시·TSV·학습·보고 완료 표시
const { chromium } = require('playwright');
const path = process.env.DASH_DIR || '/tmp/claude-0/-home-user-yeopkerphone-auction-site/7eab6cea-debf-5c8b-aa10-1319f64a3bc8/scratchpad/v107/';
const file = process.env.DASH_FILE || 'dashboard_v107.html';
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const Y = new Date(); Y.setDate(Y.getDate() - 1); const D = ymd(Y);
const Y2 = new Date(); Y2.setDate(Y2.getDate() - 3); const D2 = ymd(Y2);
// 잔액 사슬: 7,000,000 → +330,000 = 7,330,000 → +328,680 = 7,658,680 → −349,690 = 7,308,990 → −50,000 = 7,258,990 → +12,250 = 7,271,240
const transactions = [
  { id: 't5', sig: D + '|박OO|12250|0|7271240', date: D, description: '박OO', deposit: 12250, withdrawal: 0, balance: 7271240, studentId: null, category: 'reimburse' },
  { id: 't4', sig: D + '|대성산업(주)대성|0|50000|7258990', date: D, description: '대성산업(주)대성', deposit: 0, withdrawal: 50000, balance: 7258990, studentId: null, category: '' },
  { id: 't3', sig: D + '|국민제이(J)207|0|349690|7308990', date: D, description: '국민제이(J)207', deposit: 0, withdrawal: 349690, balance: 7308990, studentId: null, category: '', expenseCategory: 'edu_maintenance' },
  { id: 't2', sig: D + '|롯데9927821022|328680|0|7658680', date: D, description: '롯데9927821022', deposit: 328680, withdrawal: 0, balance: 7658680, studentId: null, category: '' },
  { id: 't1', sig: D + '|홍OO|330000|0|7330000', date: D, description: '홍OO', deposit: 330000, withdrawal: 0, balance: 7330000, studentId: null, category: 'tuition' },
  { id: 'u1', sig: D2 + '|대성산업(주)대성|0|40000|6900000', date: D2, description: '대성산업(주)대성', deposit: 0, withdrawal: 40000, balance: 6900000, studentId: null, category: '' },
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR', e.message); });
  await page.addInitScript(({ transactions }) => {
    window.claude = { mcp: { callTool: function (server, tool) { if (tool === 'search_files') return Promise.resolve({ payload: { files: [] } }); return Promise.resolve({ payload: {} }); } } };
    window.__copied = []; Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); } }, configurable: true });
    const seed = { students: [], auctions: [], loans: [], tasks: [], transactions, blogPosts: [], blogPostsTrash: [], blogAutomationLog: [], studentDb: [], loanConsultants: [], marketResearch: [], contentIdeas: [], schedule: [], workReports: [], resources: [], carouselDrafts: [], brandStrategyReports: [], routineRuns: [], ceoOrders: [], marketAuctions: [], meta: { cloudPulledOnce: true, marketAuctionsClearedV1: true, marketStarNormalizedV88: true, studentDbMergedV1: true, studentDbBackfillV1: true, consultingCourseFlagBackfillV1: true, paidDateBackfillV1: true, julyRosterAddedV1: true, aug5BulkImportExclusionV1: true } };
    localStorage.setItem('ahj_realestate_dashboard_v1', JSON.stringify(seed));
  }, { transactions });
  await page.goto('file://' + path + file);
  await page.waitForTimeout(1500);
  let fail = 0; const ck = (n, c) => { if (!c) fail++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n); };
  const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('ahj_realestate_dashboard_v1')));
  // 1. 메뉴 서랍에 자금일보 항목
  await page.click('#navDrawerBtn'); await page.waitForTimeout(400);
  const item = await page.$('[data-rail-view="fundDaily"]');
  ck('메뉴 서랍에 "자금일보" 항목이 있다(은행·회계 섹션)', !!item);
  const txt = await page.evaluate(() => { const b = document.querySelector('[data-rail-view="fundDaily"]'); return b ? b.textContent : ''; });
  ck('항목 라벨에 "자금일보"', txt.includes('자금일보'));
  await page.evaluate(el => el.click(), item); await page.waitForTimeout(600);
  ck('화면 제목 "자금일보 복사용 게시판"', (await page.textContent('#main')).includes('자금일보 복사용 게시판'));
  // 2. 기본 날짜 = 어제
  ck('기본 날짜가 어제(전일 보고)', (await page.inputValue('#fundDate')) === D);
  // 3. 행 5건, 잔액 사슬로 시간순 정렬
  const order = await page.evaluate(() => Array.from(document.querySelectorAll('[data-fund-row]')).map(r => r.getAttribute('data-fund-row')));
  ck('행 5건', order.length === 5);
  ck('잔액 사슬로 t1→t5 순서 복원', order.join(',') === 't1,t2,t3,t4,t5');
  // 4. 기본값
  const vals = await page.evaluate(() => Array.from(document.querySelectorAll('[data-fund-row]')).map(r => ({ id: r.getAttribute('data-fund-row'), cells: Array.from(r.querySelectorAll('td')).map(td => td.textContent.trim()), reason: r.querySelector('[data-fund-reason]').value, kind: r.querySelector('[data-fund-kind]').value, blank: Array.from(r.querySelectorAll('td.blank')).length })));
  const by = Object.fromEntries(vals.map(v => [v.id, v]));
  ck('계좌 열 = 우리(부동산에듀)', vals.every(v => v.cells[0] === '우리(부동산에듀)'));
  ck('수강료 이체 → 사유 "수강료 입금" · 구분 현금매출', by.t1.reason === '수강료 입금' && by.t1.kind === '현금매출');
  ck('카드사 정산(롯데+숫자) → "수강료 카드결제 정산" · 카드매출', by.t2.reason === '수강료 카드결제 정산' && by.t2.kind === '카드매출');
  ck('관리비(edu_maintenance) → "건물 관리비" · 운영비', by.t3.reason === '건물 관리비' && by.t3.kind === '운영비');
  ck('정산입금(reimburse) → 잡이익', by.t5.kind === '잡이익' && by.t5.reason.includes('정산'));
  ck('분류 없는 출금은 사유·구분 비어 있고 노란 칸 2개', by.t4.reason === '' && by.t4.kind === '' && by.t4.blank === 2);
  ck('금액 표시: 입금 328,680 / 출금 349,690', by.t2.cells[2] === '328,680' && by.t3.cells[3] === '349,690');
  ck('빈칸 안내 "빈칸 1건"', (await page.textContent('#main')).includes('빈칸 1건'));
  // 5. TSV 미리보기
  const tsv = await page.inputValue('#fundTsv');
  const lines = tsv.split('\n');
  ck('TSV 5줄 · 6열(탭 5개)', lines.length === 5 && lines.every(l => l.split('\t').length === 6));
  ck('TSV 첫 줄 = 우리(부동산에듀)\\t홍OO\\t330000\\t0\\t수강료 입금\\t현금매출', lines[0] === '우리(부동산에듀)\t홍OO\t330000\t0\t수강료 입금\t현금매출');
  ck('TSV 빈칸 줄은 뒤 두 칸이 빈 문자열', lines[3] === '우리(부동산에듀)\t대성산업(주)대성\t0\t50000\t\t');
  // 6. 복사 버튼 → 클립보드
  await page.click('#fundCopyAll'); await page.waitForTimeout(300);
  const copied = await page.evaluate(() => window.__copied);
  ck('전체 복사 버튼이 TSV 를 클립보드에 넣는다', copied.length === 1 && copied[0] === tsv);
  await page.click('#fundCopyRK'); await page.waitForTimeout(300);
  const copied2 = await page.evaluate(() => window.__copied);
  ck('사유·구분만 복사 → 2열', copied2.length === 2 && copied2[1].split('\n')[0] === '수강료 입금\t현금매출');
  // 7. 빈칸 채우기 → 저장 + 학습
  await page.fill('[data-fund-reason="t4"]', '업무차량 주유'); await page.press('[data-fund-reason="t4"]', 'Tab'); await page.waitForTimeout(500);
  await page.selectOption('[data-fund-kind="t4"]', '운영비'); await page.waitForTimeout(500);
  let s = await st();
  const t4 = s.transactions.find(t => t.id === 't4');
  ck('거래에 fundReason·fundKind 저장', t4.fundReason === '업무차량 주유' && t4.fundKind === '운영비');
  ck('적요별 학습 fundKeywordMap 에 기록', !!(s.meta.fundKeywordMap && Object.values(s.meta.fundKeywordMap).some(v => v.reason === '업무차량 주유' && v.kind === '운영비')));
  ck('빈칸 안내 사라짐', !(await page.textContent('#main')).includes('빈칸 '));
  // 8. 다른 날짜의 같은 적요는 학습값으로 미리 채워짐(점선 = 자동)
  await page.fill('#fundDate', D2); await page.dispatchEvent('#fundDate', 'change'); await page.waitForTimeout(600);
  const u1 = await page.evaluate(() => { const r = document.querySelector('[data-fund-row="u1"]'); return r ? { reason: r.querySelector('[data-fund-reason]').value, kind: r.querySelector('[data-fund-kind]').value, auto: !!r.querySelector('td.auto') } : null; });
  ck('3일 전 같은 적요 → 학습값 "업무차량 주유 · 운영비" 자동 채움', !!u1 && u1.reason === '업무차량 주유' && u1.kind === '운영비' && u1.auto);
  // 9. 보고 완료 표시 → meta.fundReported + 칩 ✓
  await page.click('#fundMarkReported'); await page.waitForTimeout(500);
  s = await st();
  ck('meta.fundReported 에 날짜 기록', !!(s.meta.fundReported && s.meta.fundReported[D2]));
  const chip = await page.evaluate((d) => { const b = document.querySelector('[data-fund-date="' + d + '"]'); return b ? b.textContent : ''; }, D2);
  ck('날짜 칩에 ✓ 표시', chip.includes('✓'));
  ck('버튼이 "보고 완료 취소" 로 바뀜', (await page.textContent('#fundMarkReported')).includes('취소'));
  // 10. 거래 없는 날 안내 · 전날 버튼
  await page.click('[data-fund-shift="-1"]'); await page.waitForTimeout(500);
  ck('거래 없는 날은 안내 문구', (await page.textContent('#main')).includes('등록된 거래가 없습니다'));
  ck('페이지 오류 없음', errors.length === 0);
  console.log(fail ? ('FAILED ' + fail) : 'ALL PASS');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
