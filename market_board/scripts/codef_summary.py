#!/usr/bin/env python3
"""CODEF 경매사건검색 응답을 사람이 읽을 수 있게 요약한다.

stdin 으로 응답 본문을 받는다. CODEF 는 같은 엔드포인트라도 응답을
평문 JSON 으로 줄 때와 URL 인코딩된 JSON 으로 줄 때가 있어 둘 다 처리한다.

  codef_auction 대구지방법원 2025 8313 | python3 scripts/codef_summary.py
"""
import json
import sys
import urllib.parse


def load(raw):
    """평문 JSON 이든 URL 인코딩된 JSON 이든 읽어들인다."""
    for candidate in (raw, urllib.parse.unquote_plus(raw)):
        try:
            return json.loads(candidate)
        except Exception:
            continue
    raise SystemExit('응답 파싱 실패 — 앞부분: ' + raw[:200])


def won(value):
    """'411000000' -> '4억 1,100만'"""
    try:
        n = int(str(value).replace(',', '').strip())
    except (TypeError, ValueError):
        return str(value or '-')
    if n == 0:
        return '-'
    eok, rest = divmod(n, 100_000_000)
    man = rest // 10_000
    if eok:
        return f'{eok}억 {man:,}만' if man else f'{eok}억'
    return f'{man:,}만'


def ymd(value):
    """'20260909' 또는 '20260909(1000)' -> '2026-09-09 10:00'"""
    s = str(value or '').strip()
    if len(s) < 8 or not s[:8].isdigit():
        return s or '-'
    out = f'{s[0:4]}-{s[4:6]}-{s[6:8]}'
    tail = s[8:].strip('()')
    if len(tail) == 4 and tail.isdigit():
        out += f' {tail[:2]}:{tail[2:]}'
    return out


def main():
    doc = load(sys.stdin.read().strip())

    result = doc.get('result') or {}
    code = result.get('code')
    if code and code != 'CF-00000':
        raise SystemExit(f"API 오류 {code}: {result.get('message', '')} {result.get('extraMessage', '')}".strip())

    data = doc.get('data') or {}
    if isinstance(data, list):
        data = data[0] if data else {}

    print(f"사건번호 : {data.get('resCaseNumber', '-')}  ({data.get('resCaseName', '-')})")
    print(f"종국결과 : {data.get('resFinalResult', '-')}   청구금액 : {won(data.get('resClaimAmt'))}")
    print(f"접수일자 : {ymd(data.get('resReceiptDate'))}   개시결정 : {ymd(data.get('resDecisionDate'))}")
    if data.get('resNote'):
        print(f"담당계   : {data['resNote'].strip()}")

    products = data.get('resProductList') or []
    if products:
        print('\n── 물건내역 ──')
        for p in products:
            print(f"  물건 {p.get('resNumber', '?')} · {p.get('resUseType', '-')} · 상태 {p.get('resState', '-')}")
            print(f"    감정평가액 {won(p.get('resValuationAmt'))}   최저매각가 {won(p.get('resAmount'))}")
            if p.get('resDate'):
                print(f"    기일 {ymd(p['resDate'])}")
            if p.get('resResultDesc'):
                print(f"    최근결과 {p['resResultDesc'].strip()}")
            for detail in (p.get('resDetailList') or []):
                if detail.get('resAddress'):
                    print(f"    소재지 {detail['resAddress']}  [{detail.get('resType', '')}]")
            if p.get('resNote'):
                print(f"    ⚠ 비고 {p['resNote'].strip()}")

    dates = data.get('resDateList') or []
    if dates:
        print('\n── 기일내역 ──')
        for d in dates:
            amount = won(d.get('resAmount')) if d.get('resAmount') else '-'
            print(f"  {ymd(d.get('resDate')):<18} {d.get('resKind', ''):<8} "
                  f"최저 {amount:>13}   {d.get('resResultDesc', '').strip()}")

    people = [p for p in (data.get('resInvolvedPersonList') or []) if p.get('resType')]
    if people:
        print('\n── 당사자 ──')
        print('  ' + ', '.join(p['resType'] for p in people))

    related = data.get('resInvolvedCaseList') or []
    if related and any(r.get('resCaseNumber') for r in related):
        print('\n── 관련사건 ──')
        for r in related:
            if r.get('resCaseNumber'):
                print(f"  {r.get('commCourt', '')} {r['resCaseNumber']} ({r.get('resType', '')})")

    print(f"\n송달내역 {len(data.get('resDeliveryList') or [])}건 · "
          f"문건내역 {len(data.get('resDocumentList') or [])}건")


if __name__ == '__main__':
    main()
