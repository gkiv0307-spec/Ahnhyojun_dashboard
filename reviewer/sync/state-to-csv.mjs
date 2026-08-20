/**
 * 발행본에 담긴 대시보드 내용을 CSV 로 꺼낸다. (대시보드 → 구글드라이브 방향)
 *
 * 기존 리뷰노트 시트에 직접 써넣을 수는 없다. Drive 도구는 파일의 제목·위치만
 * 바꿀 수 있고 내용은 바꾸지 못하기 때문이다. 그래서 이 CSV 를 새 스프레드시트로
 * 올리는 방식으로 내보낸다. 원본 시트는 건드리지 않는다.
 *
 * 사용법
 *   node state-to-csv.mjs --live <발행본.html> --password <비밀번호> [--out <파일.csv>] [--changed-only]
 *
 * --changed-only 를 주면 대시보드에서 직접 잡은 예약과 직접 추가한 사람만 뽑는다.
 * 원본 시트에 손으로 옮겨 적을 때는 이쪽이 편하다(전체는 대시보드의 엑셀 내려받기를 쓰면 된다).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf('--' + n); return i < 0 ? null : argv[i + 1]; };
const liveFile = opt('live'), password = opt('password');
const outFile = opt('out') || '/tmp/dashboard-export.csv';
const changedOnly = argv.includes('--changed-only');
if (!liveFile || !password) {
  console.error('사용법: node state-to-csv.mjs --live <발행본.html> --password <비밀번호> [--out <파일.csv>]');
  process.exit(2);
}

const page = fs.readFileSync(liveFile, 'utf8');
const salt = Buffer.from(/salt: '([^']+)'/.exec(page)[1], 'base64');
const iters = Number(/iter: (\d+)/.exec(page)[1]);
const want = /hash: '([^']+)'/.exec(page)[1];
const bits = crypto.pbkdf2Sync(password, salt, iters, 64, 'sha256');
if (bits.subarray(0, 32).toString('base64') !== want) throw new Error('비밀번호가 페이지의 잠금과 맞지 않습니다.');
const key = bits.subarray(32);

const m = /<script id="seed-data" type="application\/json">([\s\S]*?)<\/script>/.exec(page);
if (!m || m[1].trim() === 'null') throw new Error('발행본에 저장된 데이터가 없습니다.');
const seed = JSON.parse(m[1].trim().replace(/\\u003c/g, '<'));
const iv = Buffer.from(seed.payload.iv, 'base64');
const buf = Buffer.from(seed.payload.data, 'base64');
const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
d.setAuthTag(buf.subarray(buf.length - 16));
const state = JSON.parse(Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString('utf8'));

const COLS = ['지점명', '리뷰어명', '계정 URL', '연락처', '주소', '노출점수', '등급', '일 방문 수',
  '희망일', '희망시간', '예약상태', '리뷰등록', '신청메시지', '메모', '입력 경로'];

// 엑셀에서 수식으로 실행되지 않도록 앞에 따옴표를 붙인다
const safe = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const rows = [COLS.join(',')];
for (const r of state.reviewers) {
  const edited = r.localEdit && Object.keys(r.localEdit).length;
  if (changedOnly && !edited && r.source !== 'manual') continue;
  const via = r.source === 'manual' ? '대시보드 직접추가' : (edited ? '대시보드 수정' : '시트');
  rows.push([r.branchName, r.name, r.accountUrl, r.phone, r.address, r.exposureScore, r.grade,
    r.dailyVisits, r.wishDate, r.wishTime, r.status, r.reviewRegistered ? 'Y' : 'N',
    r.applyMessage, r.memo, via].map(safe).join(','));
}
fs.writeFileSync(outFile, '﻿' + rows.join('\r\n'), 'utf8');

const via = {};
state.reviewers.forEach((r) => {
  const k = r.source === 'manual' ? '직접추가' : (r.localEdit && Object.keys(r.localEdit).length ? '대시보드 수정' : '시트');
  via[k] = (via[k] || 0) + 1;
});
console.log(`${rows.length - 1}명 → ${path.basename(outFile)} (${Math.round(fs.statSync(outFile).size / 1024)}KB)`);
console.log('입력 경로별:', JSON.stringify(via));
