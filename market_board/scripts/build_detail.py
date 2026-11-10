#!/usr/bin/env python3
"""data/codef-raw/*.json → data/detail.json

물건 상세("경매지") 화면에 쓸 형태로 추린다. 키는 `법원|사건번호`.

비고 자유서술은 반드시 mask_names 를 통과시킨다 — CODEF 가 당사자 목록은
가려 주지만 비고는 법원 문서를 그대로 넘긴다.
"""
import json, glob, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mask_names import mask

def d(v):
    m = re.match(r'^(\d{4})(\d{2})(\d{2})', str(v or ''))
    return f'{m.group(1)}-{m.group(2)}-{m.group(3)}' if m else None

def t(v):
    m = re.search(r'\((\d{2})(\d{2})\)', str(v or ''))
    return f'{m.group(1)}:{m.group(2)}' if m else None

def num(v):
    try: return int(v)
    except (TypeError, ValueError): return None

def s(v):
    return mask(re.sub(r'\s+', ' ', (v or '')).strip()) or None

# 송달 결과 중 점유·연락 상태를 알려주는 것만 따로 표시한다.
FLAGGY = ('폐문부재', '이사불명', '수취인불명', '주소불명', '거절', '반송', '미도달')

out = {}
for f in sorted(glob.glob('data/codef-raw/*.json')):
    court = os.path.basename(f).split('_')[0]
    raw = json.load(open(f, encoding='utf-8'))
    dd = raw.get('data') or raw
    case = (dd.get('resCaseNumber') or '').split()[0]
    if not case:
        continue

    dates = {}
    for e in dd.get('resDateList') or []:
        n = num(e.get('resNumber')) or 1
        dates.setdefault(n, []).append({
            'd': d(e.get('resDate')), 't': t(e.get('resDate')),
            'k': s(e.get('resKind')), 'r': s(e.get('resResultDesc')),
            'amt': num(e.get('resAmount')), 'pl': s(e.get('resPlace')),
        })

    deliv = [{'d': d(e.get('resMailingDate')), 'c': s(e.get('resContents')),
              'r': s(e.get('resResultDesc'))}
             for e in dd.get('resDeliveryList') or []]

    out[f'{court}|{case}'] = {
        'ct': court, 'caNo': case,
        'name': s(dd.get('resCaseName')),
        'receipt': d(dd.get('resReceiptDate')),
        'decision': d(dd.get('resDecisionDate')),
        'final': s(dd.get('resFinalResult')),
        'closedAt': d(dd.get('commEndDate')),
        'claim': num(dd.get('resClaimAmt')),
        'desk': s(dd.get('resNote')),
        'merger': s(dd.get('resMerger')),
        'parties': [{'t': s(x.get('resType')), 'n': s(x.get('resNote'))}
                    for x in dd.get('resInvolvedPersonList') or []],
        'docs': [{'d': d(x.get('resReceiptDate')), 'c': s(x.get('resContents'))}
                 for x in dd.get('resDocumentList') or []],
        'deliv': deliv,
        'delivFlag': [x for x in deliv if x['r'] and any(k in x['r'] for k in FLAGGY)],
        'dist': [{'no': num(x.get('resNumber')), 'd': d(x.get('resDecisionDate')),
                  'a': s(x.get('resAddress'))}
                 for x in dd.get('resDistributionList') or []],
        'inv': [{'no': num(x.get('resNumber')), 'a': s(x.get('resAddress')),
                 'ty': s(x.get('resType')), 'note': s(x.get('resNote'))}
                for x in dd.get('resInventoryList') or []],
        'rel': [{'ct': s(x.get('commCourt')), 'no': s(x.get('resCaseNumber')),
                 'ty': s(x.get('resType'))}
                for x in dd.get('resInvolvedCaseList') or []],
        'prod': [{'no': num(x.get('resNumber')), 'use': s(x.get('resUseType')),
                  'ap': num(x.get('resValuationAmt')), 'mn': num(x.get('resAmount')),
                  'state': s(x.get('resState')), 'note': s(x.get('resNote')),
                  'ld': dates.get(num(x.get('resNumber')) or 1, [])}
                 for x in dd.get('resProductList') or []],
    }

json.dump(out, open('data/detail.json', 'w', encoding='utf-8'), ensure_ascii=False)
tot = os.path.getsize('data/detail.json')
print(f'사건 {len(out)}건 · {tot/1024:.0f}KB')
for k in ('docs', 'deliv', 'parties', 'dist', 'rel'):
    print(f'  {k:8s} {sum(len(v[k]) for v in out.values()):5d}')
