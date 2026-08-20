/**
 * 발행본의 데이터를 새로 빌드한 페이지로 옮겨 담는다.
 *
 * dashboard.html 은 저장소에 데이터 없이(seed = null) 보관한다.
 * 그래서 코드를 고쳐 그대로 다시 발행하면 발행본에 쌓여 있던 데이터가 지워진다.
 * 이 스크립트는 현재 발행본에서 암호화된 데이터 덩어리만 꺼내
 * 새로 빌드한 페이지에 그대로 끼워 넣는다. 비밀번호는 필요 없다(풀지 않으므로).
 *
 * 사용법
 *   1) 현재 발행본 HTML 을 파일로 저장한다 (브라우저에서 페이지 소스 저장)
 *   2) python3 build-dashboard.py           # 코드 변경분으로 새로 빌드
 *   3) node reseed.mjs <저장한-발행본.html> # → dashboard-seeded.html 생성
 *   4) 만들어진 dashboard-seeded.html 을 발행한다
 */
import fs from 'node:fs';
import path from 'node:path';

const SEED_RE = /(<script id="seed-data" type="application\/json">)([\s\S]*?)(<\/script>)/;

const live = process.argv[2];
if (!live) {
  console.error('사용법: node reseed.mjs <현재-발행본.html> [출력파일]');
  process.exit(2);
}
const here = path.dirname(new URL(import.meta.url).pathname);
const out = process.argv[3] || path.join(here, 'dashboard-seeded.html');

const liveHtml = fs.readFileSync(live, 'utf8');
const liveSeed = SEED_RE.exec(liveHtml);
if (!liveSeed) { console.error('발행본에서 seed 를 찾지 못했습니다.'); process.exit(1); }

const seed = liveSeed[2].trim();
if (!seed || seed === 'null') {
  console.error('발행본에 저장된 데이터가 없습니다. 그냥 dashboard.html 을 발행하면 됩니다.');
  process.exit(1);
}

const fresh = fs.readFileSync(path.join(here, 'dashboard.html'), 'utf8');
if (!SEED_RE.test(fresh)) { console.error('dashboard.html 에 seed 자리가 없습니다. 먼저 build-dashboard.py 를 실행하세요.'); process.exit(1); }

fs.writeFileSync(out, fresh.replace(SEED_RE, (_, a, __, b) => a + seed + b));
console.log(`데이터 ${Math.round(seed.length / 1024)}KB 를 새 빌드에 옮겨 담았습니다 → ${path.basename(out)}`);
console.log('이 파일을 발행하면 코드 변경과 기존 데이터가 함께 반영됩니다.');
