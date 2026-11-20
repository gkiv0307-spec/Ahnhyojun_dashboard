// 실행: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const { parseDocument, parseTitle, formatAccount } = require('../lib/parse');

test('계좌번호 4자리 끊기 (가이드 4번 예시)', () => {
  assert.strictEqual(formatAccount('3333307424933'), '3333 3074 2493 3');
  assert.strictEqual(formatAccount('41309442304045'), '4130 9442 3040 45');
  assert.strictEqual(formatAccount('05000724097383'), '0500 0724 0973 83');
  assert.strictEqual(formatAccount('1002-539-525777'), '1002-539-525777'); // 하이픈 있으면 그대로
});

test('제목에서 요청일·내용·금액 분리', () => {
  assert.deepStrictEqual(parseTitle('26/11/19_양산 이그니스 호텔 자재비_575,740'), {
    content: '양산 이그니스 호텔 자재비', requestDate: '11/19', titleAmount: 575740,
  });
  assert.deepStrictEqual(parseTitle('(양산점) 26/11/16_객실 소파_223,200원'), {
    content: '(양산점) 객실 소파', requestDate: '11/16', titleAmount: 223200,
  });
});

test('가이드 5번 카톡 원문 형식', () => {
  const r = parseDocument([
    '제목 26/11/19_양산 이그니스 호텔 자재비_575,740',
    '기업은행 41309442304045 (인테리어패밀리)',
    '575,740 원',
    '양산 인테리어',
  ].join('\n'));
  assert.strictEqual(r.holder, '인테리어패밀리');
  assert.strictEqual(r.amount, 575740);
  assert.strictEqual(r.bank, '기업은행');
  assert.strictEqual(r.account, '4130 9442 3040 45');
  assert.strictEqual(r.content, '양산 이그니스 호텔 자재비');
  assert.strictEqual(r.requestDate, '11/19');
  assert.deepStrictEqual(r.warnings, []);
});

test('표 형태(라벨/값이 탭 또는 다음 줄)', () => {
  const r = parseDocument([
    '문서제목\t양산점 전기안전검사비용',
    '기안부서\t양산 인테리어',
    '예 금 주',
    '한국전기안전공사김해',
    '은행명 : 국민',
    '계좌번호 655601-04-252017',
    '지급금액\t202,070',
  ].join('\n'));
  assert.strictEqual(r.holder, '한국전기안전공사김해');
  assert.strictEqual(r.amount, 202070);
  assert.strictEqual(r.bank, '국민');
  assert.strictEqual(r.account, '655601-04-252017');
  assert.strictEqual(r.dept, '양산 인테리어');
});

test('추측 금지: 금액 불일치·계좌 여러 개면 비우고 경고', () => {
  const r = parseDocument([
    '제목 26/11/19_자재비_100,000',
    '합계 120,000',
    '기업은행 41309442304045 (가업체)',
    '국민은행 9627370100840 (나업체)',
  ].join('\n'));
  assert.strictEqual(r.amount, null);
  assert.strictEqual(r.account, '');
  assert.strictEqual(r.bank, '');
  assert.ok(r.warnings.some((w) => w.includes('금액')));
  assert.ok(r.warnings.some((w) => w.includes('계좌가 2개')));
});
