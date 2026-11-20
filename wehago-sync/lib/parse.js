// 위하고 결의서 화면의 글자(innerText)에서 시트에 필요한 값을 뽑아낸다.
// 원칙: 확실하지 않은 값은 비워 두고 warnings 에 이유를 남긴다(추측 금지).

const BANKS = [
  'KB국민은행', '국민은행', '국민', '신한은행', '신한', '우리은행', '우리', '하나은행', '하나',
  'IBK기업은행', '기업은행', '기업', 'NH농협은행', '농협은행', '농협', '지역농협', '수협',
  '신협', '새마을금고', '새마을', '우체국', '카카오뱅크', '카카오', '토스뱅크', '토스', '케이뱅크',
  'iM뱅크(대구은행)', 'iM뱅크', '대구은행', '대구', '부산은행', '부산', '경남은행', '경남',
  '광주은행', '전북은행', '제주은행', 'SC제일은행', '제일은행', '씨티은행', '산업은행', '산림조합',
];
// 긴 이름부터 맞춰야 '기업은행'이 '기업'보다 먼저 잡힌다.
const BANKS_SORTED = [...BANKS].sort((a, b) => b.length - a.length);

const LABELS = {
  title: ['문서제목', '제목', '건명'],
  holder: ['예금주', '받는분', '수취인', '입금자명'],
  bank: ['입금은행', '은행명', '은행'],
  account: ['입금계좌', '계좌번호', '계좌'],
  amount: ['지급금액', '청구금액', '합계금액', '총금액', '총액', '합계', '지급액', '금액'],
  dept: ['기안부서', '작성부서', '부서'],
  proofType: ['증빙유형', '증빙구분'],
};
const ALL_LABELS = Object.values(LABELS).flat();

function normLines(text) {
  return String(text || '')
    .replace(/ /g, ' ')
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);
}

const strip = (s) => s.replace(/\s+/g, '');

// "예금주 : 홍길동" / "예금주\t홍길동" / "예금주" 다음 줄 "홍길동" 모두 처리
function labelValue(lines, labels) {
  for (const label of labels) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!strip(line).startsWith(label)) continue;
      // 라벨이 더 긴 다른 라벨의 앞부분인 경우(예: '계좌' vs '계좌번호')는 건너뜀
      const longer = ALL_LABELS.find((l) => l !== label && l.startsWith(label) && strip(line).startsWith(l));
      if (longer) continue;
      // 라벨 글자 사이 공백("예 금 주")을 허용하며 라벨 끝 위치를 찾는다
      let pos = 0;
      for (const ch of label) {
        while (/\s/.test(line[pos])) pos++;
        pos++; // ch 와 일치(위에서 startsWith 로 확인됨)
      }
      let rest = line.slice(pos).replace(/^[\s:：]+/, '').trim();
      if (!rest) {
        const next = lines[i + 1];
        if (next && !ALL_LABELS.some((l) => strip(next).startsWith(l))) rest = next.trim();
      }
      if (rest) return rest;
    }
  }
  return '';
}

function toAmount(s) {
  const m = String(s || '').match(/\d{1,3}(?:,\d{3})+|\d+/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function findBank(s) {
  const t = String(s || '');
  return BANKS_SORTED.find((b) => t.includes(b)) || '';
}

const ACCOUNT_RE = /\d{2,7}(?:[- ]\d{1,7}){1,5}|\d{9,16}/g;

function cleanAccount(s) {
  const m = String(s || '').match(ACCOUNT_RE);
  if (!m) return '';
  const best = m.map((x) => x.trim()).sort((a, b) => b.replace(/\D/g, '').length - a.replace(/\D/g, '').length)[0];
  const digits = best.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 16 ? best : '';
}

// 가이드 4번: 숫자만 있으면 4자리씩 공백. 하이픈/공백이 이미 있으면 원본 유지.
function formatAccount(acc) {
  const a = String(acc || '').trim();
  if (!a) return '';
  if (/^\d+$/.test(a)) return a.replace(/(\d{4})(?=\d)/g, '$1 ');
  return a;
}

// "26/11/19_양산 이그니스 호텔 자재비_575,740" 형태의 제목 해석
function parseTitle(title) {
  const t = String(title || '').trim();
  const m = t.match(/(\d{2})\/(\d{1,2})\/(\d{1,2})_(.+?)_([\d,]+)\s*원?\s*$/);
  if (!m) return { content: t, requestDate: '', titleAmount: toAmount(t.match(/_([\d,]+)\s*원?\s*$/)?.[1]) };
  const prefix = t.slice(0, m.index).trim();
  const content = [prefix, m[4].trim()].filter(Boolean).join(' ');
  return { content, requestDate: `${Number(m[2])}/${Number(m[3])}`, titleAmount: toAmount(m[5]) };
}

// "기업은행 41309442304045 (인테리어패밀리)" 같은 한 줄 표기
function parseInlinePayee(lines) {
  const found = [];
  for (const line of lines) {
    const bank = findBank(line);
    if (!bank) continue;
    const acc = cleanAccount(line.slice(line.indexOf(bank) + bank.length));
    if (!acc) continue;
    const holder = (line.match(/\(([^)]+)\)\s*$/) || [])[1] || '';
    found.push({ bank, account: acc, holder: holder.trim() });
  }
  return found;
}

function parseDocument(text) {
  const lines = normLines(text);
  const warnings = [];

  const title = labelValue(lines, LABELS.title);
  const { content, requestDate, titleAmount } = parseTitle(title);

  let holder = labelValue(lines, LABELS.holder);
  let bankRaw = labelValue(lines, LABELS.bank);
  let account = cleanAccount(labelValue(lines, LABELS.account));
  let bank = findBank(bankRaw) ? bankRaw.split(/\s/)[0] : '';

  const inline = parseInlinePayee(lines);
  const uniqueAccounts = [...new Set(inline.map((p) => p.account.replace(/\D/g, '')))];
  if (uniqueAccounts.length > 1) {
    warnings.push(`계좌가 ${uniqueAccounts.length}개 보임 — 계좌·예금주 직접 확인 필요`);
    if (!labelValue(lines, LABELS.account)) { account = ''; bank = ''; }
  } else if (inline.length) {
    if (!account) account = inline[0].account;
    if (!bank) bank = inline[0].bank;
    if (!holder) holder = inline[0].holder;
  }
  if (account && !bank) {
    const line = lines.find((l) => l.includes(account));
    bank = findBank(line);
  }

  const docAmount = toAmount(labelValue(lines, LABELS.amount));
  let amount = docAmount || titleAmount;
  if (docAmount && titleAmount && docAmount !== titleAmount) {
    warnings.push(`제목 금액(${titleAmount.toLocaleString()})과 본문 금액(${docAmount.toLocaleString()})이 다름 — 확인 필요`);
    amount = null;
  }

  if (!holder) warnings.push('예금주를 찾지 못함');
  if (!amount) warnings.push('금액을 확정하지 못함');
  if (!account) warnings.push('계좌번호를 찾지 못함');

  return {
    title,
    content: content || title,
    requestDate,
    holder,
    amount,
    bank,
    account: formatAccount(account),
    dept: labelValue(lines, LABELS.dept),
    proofType: labelValue(lines, LABELS.proofType),
    warnings,
  };
}

module.exports = { parseDocument, parseTitle, formatAccount, cleanAccount, findBank, labelValue, normLines, toAmount };
