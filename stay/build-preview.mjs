/* 숙박 예약관리 시스템 → 단일 HTML 미리보기 빌드
 *
 * stay/ 의 원본 파일들을 그대로 읽어 하나의 자립형 HTML로 합친다.
 * 원본을 손으로 복사하지 않고 기계적으로 변환하므로 소스가 바뀌면 다시 돌리기만 하면 된다.
 *
 *   node stay/build-preview.mjs   →  stay/preview.html
 *
 * 멀티페이지(.html 이동)를 해시 라우팅(#/page?query)으로 바꾸는 것이 핵심이다.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.join(ROOT, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const PAGES = ['index', 'new', 'mystay', 'requests', 'detail', 'approvals',
               'settlement', 'lodgings', 'notifications', 'notices', 'admin'];

/* 직원용 배포에 들어가는 화면만. 나머지는 번들에서 아예 빠진다. */
const STAFF_PAGES = ['new', 'mystay', 'lodgings', 'notices'];

/* ---------- 1. CSS: Pretendard(CDN 차단됨) 대신 Noto Sans KR 폴백 추가 ---------- */
let css = read('assets/stay.css').replace(
  /font-family:"Pretendard","Apple SD Gothic Neo"/g,
  'font-family:"Pretendard","Noto Sans KR","Apple SD Gothic Neo"'
);

/* ---------- 2. 로고 인라인 ---------- */
const logo = 'data:image/png;base64,' +
  fs.readFileSync(path.join(REPO, 'assets/logo-dark.png')).toString('base64');

/* ---------- 3. 공용 스크립트 ---------- */
const gate  = read('assets/gate.js');
const store = read('assets/store.js');
let auth    = read('assets/auth.js');
let ui      = read('assets/ui.js');

/* 셸을 body 최상단이 아니라 전용 컨테이너에 붙인다(제목/스타일 태그 앞에 끼어들지 않도록) */
ui = ui.replace(
  'document.body.insertBefore(app, document.body.firstChild);',
  "document.getElementById('stay-root').appendChild(app);"
);
/* 로고 경로 → 인라인 데이터 URI */
ui = ui.replace("src=\\'../assets/logo-dark.png\\'", "src=\\'" + logo + "\\'")
       .replace('src="../assets/logo-dark.png"', 'src="' + logo + '"');
/* 사이드바 하단: 매물사이트 상대링크는 단일 파일에서 무의미하므로 미리보기 안내로 교체.
 * ui.js 의 해당 문자열이 바뀌면 여기서 바로 알 수 있도록 실패시킨다. */
{
  const marker = `'<a href="notices.html">이용지침 보기</a> · <a href="../index.html">매물사이트</a>'`;
  if (!ui.includes(marker)) throw new Error('ui.js 사이드바 푸터 문자열을 찾지 못했습니다 — 원본이 바뀌었는지 확인하세요.');
  ui = ui.replace(marker,
    `'<a href="notices.html">이용지침 보기</a><br><br>' +
     '<span style="color:#5c5f68">미리보기 · 입력한 내용은<br>이 브라우저에만 저장됩니다</span>'`);
}

/* 파일 저장: 아티팩트 뷰어는 <a download> 를 막으므로 downloads 능력으로 우회한다.
 * 능력이 없으면(로컬에서 파일로 열었을 때 등) 기존 앵커 방식으로 되돌아간다. */
{
  const marker = "    a.download = filename; document.body.appendChild(a); a.click(); a.remove();\n" +
                 "    toast(filename + ' 파일을 내려받았습니다.', 'ok');";
  if (!ui.includes(marker)) throw new Error('ui.js download() 본문을 찾지 못했습니다 — 원본이 바뀌었는지 확인하세요.');
  ui = ui.replace(marker, `    if (window.claude && typeof window.claude.use === 'function') {
      window.claude.use('downloads').then(function (dl) {
        if (!dl) { toast('이 미리보기에서는 파일 저장을 지원하지 않습니다.', 'bad'); return null; }
        return dl.save({ filename: filename, data: body }).catch(function (err) {
          /* csv 는 확장 허용목록에 없을 수 있다 — 같은 내용을 .txt 로 다시 제안 */
          if (err && err.code === 'extension_not_enabled' && isCsv) {
            return dl.save({ filename: filename.replace(/\\.csv$/i, '.txt'), data: body });
          }
          throw err;
        });
      }).then(function (r) {
        if (r) toast('파일을 저장했습니다.', 'ok');
      }).catch(function (err) {
        if (err && err.code === 'declined') return;              /* 사용자가 취소 */
        toast('파일 저장에 실패했습니다' + (err && err.code ? ' (' + err.code + ')' : '') + '.', 'bad');
      });
      return;
    }
    a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    toast(filename + ' 파일을 내려받았습니다.', 'ok');`);
}

/* 인라인 <script> 안에 </script> 문자열이 있으면 HTML 파서가 거기서 스크립트를 끊는다.
 * 주석이든 문자열이든 상관없이 깨지므로, 삽입 직전에 항상 이스케이프한다. */
const inline = (js) => String(js).replace(/<\/script/gi, '<\\/script');

/* ---------- 4. 페이지 스크립트 ---------- */
function pageScript(name) {
  const html = read(name + '.html');
  const m = html.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error(name + '.html 에서 인라인 스크립트를 찾지 못했습니다.');
  return m[1];
}

/* ---------- 5. 멀티페이지 → 해시 라우팅 변환 ---------- */
function toHashRouting(src) {
  return src
    .replace(/location\.reload\(\)/g, 'NAV.reload()')
    .replace(/location\.href/g, 'NAV.href')
    .replace(/location\.search/g, 'NAV.search')
    /* 페이지 주소를 담은 모든 문자열 리터럴을 해시 주소로.
     * 앵커(href="requests.html?x=1")뿐 아니라 변수로 넘겨지는 주소
     * (예: 대시보드 KPI 카드의 'requests.html?status=UPCOMING')까지 포함해야 한다. */
    .replace(/(['"])([a-z]+)\.html/g, '$1#/$2');
}
ui   = toHashRouting(ui);
auth = toHashRouting(auth);   /* 사이드바 MENUS 의 href 가 여기 들어있다 — 빠뜨리면 메뉴 전체가 죽는다 */

/* 변환 누락 검사 — 놓친 링크가 있으면 죽은 링크가 되므로 빌드를 실패시킨다 */
for (const [label, src] of [['ui.js', ui], ['auth.js', auth]]) {
  const leftover = src.match(/\b[a-z]+\.html/g);
  if (leftover) throw new Error(`${label}: 변환되지 않은 페이지 링크가 남았습니다 → ${[...new Set(leftover)].join(', ')}`);
}

/* ---------- 6. 라우터 ---------- */
const router = `
/* 해시 라우터 — 원본의 페이지 이동(location.href='x.html?q')을 그대로 흡수한다 */
var PAGES = {};
var CUR = { page:'index', q:'' };

function parseHash(h){
  h = String(h || '').replace(/^#\\/?/, '');
  var i = h.indexOf('?');
  return { page: (i < 0 ? h : h.slice(0, i)) || Deploy.home(), q: i < 0 ? '' : h.slice(i + 1) };
}

var NAV = {
  /* 'detail.html?id=x' 같은 원본 형식을 받아 해시로 옮긴다 */
  set href(v){
    var s = String(v).replace(/^[.\\/]*/, '').replace(/^#\\//, '').replace(/\\.html/, '');
    var target = '#/' + s;
    if (location.hash === target) draw();      /* 같은 주소면 이벤트가 안 오므로 직접 다시 그린다 */
    else location.hash = target;
  },
  get href(){ return location.href; },
  get search(){ return CUR.q ? '?' + CUR.q : ''; },
  reload: function(){ draw(); }
};

function draw(){
  CUR = parseHash(location.hash);
  /* 직원용 배포에서 주소를 직접 쳐서 관리 화면으로 들어오는 것을 막는다 */
  if (!Deploy.allowsRoute(CUR.page) || !PAGES[CUR.page]) {
    var home = Deploy.home();
    if (CUR.page !== home) { CUR = { page: home, q: '' }; }
  }
  /* 이전 화면과 떠 있던 오버레이 정리 */
  ['.app', '.pop', '.mask', '.backdrop', '.toasts'].forEach(function(sel){
    Array.prototype.forEach.call(document.querySelectorAll(sel), function(el){ el.remove(); });
  });
  document.body.style.overflow = '';
  var fn = PAGES[CUR.page] || PAGES[Deploy.home()];
  try { fn(); }
  catch (e) {
    console.error('[stay] 화면 오류', CUR.page, e);
    document.getElementById('stay-root').innerHTML =
      '<div style="padding:40px;font-weight:700">화면을 그리는 중 오류가 발생했습니다: ' + CUR.page + '</div>';
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', draw);

/* 공유 링크 잠금 — 풀린 뒤에 화면을 그린다 */
function start(){
  if (Gate.locked()) Gate.render(start);
  else draw();
}
`;

/* ---------- 7. 출력 (관리용 / 직원용 두 벌) ---------- */
function bundle({ file, title, mode, pageList, passcode }) {
  const body = pageList
    .map(n => `PAGES[${JSON.stringify(n)}] = function(){\n${pageScript(n)}\n};`)
    .join('\n\n');
  const routed = toHashRouting(
    body.replace("history.length > 1 ? history.back() : location.href='index.html';",
                 "location.href='" + (mode === 'staff' ? 'new' : 'index') + ".html';")
  );
  const leftover = routed.match(/\b[a-z]+\.html/g);
  if (leftover) throw new Error(`${file}: 변환되지 않은 페이지 링크 → ${[...new Set(leftover)].join(', ')}`);

  const out = `<meta charset="utf-8">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800;900&display=swap">
<style>
${css}
</style>

<div id="stay-root"></div>

<script>
window.STAY_MODE = ${JSON.stringify(mode)};
window.STAY_PASSCODE = ${JSON.stringify(passcode)};
</script>
<script>
${inline(gate)}
</script>
<script>
${inline(store)}
</script>
<script>
${inline(auth)}
</script>
<script>
${inline(ui)}
</script>
<script>
${inline(router)}
</script>
<script>
${inline(routed)}
</script>
<script>
start();
</script>
`;
  fs.writeFileSync(path.join(ROOT, file), out);
  console.log(`${file.padEnd(22)} ${(out.length / 1024).toFixed(0)}KB  화면 ${pageList.length}개  [${mode}]`);
}

/* 공유 링크 비밀번호. 바꾸려면 이 값을 고치고 다시 빌드·배포한다.
 * 관리용은 전 지점 예약·비용·연락처가 모두 보이므로 직원용과 다른 번호를 쓴다.
 * 브라우저에서 도는 코드라 우회가 가능하므로 실수 유입을 막는 문턱일 뿐이다. */
bundle({ file:'preview.html',       title:'옆커폰 숙박 예약관리',
         mode:'admin', pageList: PAGES,       passcode:'0130' });
bundle({ file:'preview-staff.html', title:'옆커폰 숙박 예약 신청',
         mode:'staff', pageList: STAFF_PAGES, passcode:'0000' });
