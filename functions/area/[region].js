/* GET /area/{지역코드} — 지역별 경매 물건 페이지
 *
 * "대구아파트경매", "부산아파트경매" 처럼 지역+키워드 검색을 잡기 위한 페이지.
 * 물건이 MIN_PROPERTIES_PER_REGION 건 미만인 지역은 내용이 빈약해 저품질로 평가되므로
 * 아예 열지 않는다(404). 물건이 쌓이면 자동으로 열린다.
 */
import { SITE, esc, page, html, originOf, organizationLd, breadcrumbLd, itemListLd } from "../_lib/site.js";
import { getProperties, groupByRegion, regionByCode, MIN_PROPERTIES_PER_REGION } from "../_lib/properties.js";
import { propertyGrid, regionLinks, ctaSection, answerBlock, faqSection } from "../_lib/ui.js";
import { faqLd, GUIDES } from "../_lib/guides.js";

/** 그 지역 물건에서 가장 많은 종류를 골라 제목에 쓴다(예: "대구 아파트 경매"). */
function dominantKind(items) {
  const count = new Map();
  for (const p of items) {
    const k = (p.category || "").replace(/\s*경매$/, "");
    if (!k || k === "경매매물") continue;
    count.set(k, (count.get(k) || 0) + 1);
  }
  if (!count.size) return "";
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/* 지역마다 다른 값이 들어간 질문/답변을 만든다.
 * 답변형 검색엔진(ChatGPT·Perplexity·구글 AI 개요)은 "부산 아파트 경매 어디서 보나요" 같은
 * 질문에 답하는 문서를 인용하므로, 그 질문 형태를 그대로 페이지에 넣어 둔다.
 * 모든 지역이 같은 문장이면 중복 콘텐츠가 되므로 건수·동네·유형을 실제 값으로 채운다. */
function regionFaq(region, items, kind, subs) {
  const where = subs.length ? subs.slice(0, 3).join(", ") : region.full;
  return [
    {
      q: `${region.name} ${kind} 경매 물건은 어디서 볼 수 있나요?`,
      a: `대법원 법원경매정보에서 ${region.full} 관할 법원으로 검색하면 전체 물건을 볼 수 있습니다. 이 페이지에는 옆커폰부동산에듀가 직접 임장과 권리분석을 거쳐 정리한 ${region.name} 물건 ${items.length}건을 모아 두었으며, 각 물건에서 감정가와 최저매각가, 확인해야 할 권리관계를 함께 볼 수 있습니다.`,
    },
    {
      q: `지금 ${region.name}에는 어떤 경매 물건이 나와 있나요?`,
      a: `현재 ${where} 일대를 중심으로 ${items.length}건이 올라와 있습니다. 물건은 블로그에 새 분석 글이 올라오면 자동으로 이 페이지에 반영되므로, 최신 상태는 이 페이지에서 바로 확인하실 수 있습니다.`,
    },
    {
      q: `${region.name} ${kind} 경매, 입찰가는 어떻게 정하나요?`,
      a: `감정가가 아니라 현재 실거래 시세에서 출발해야 합니다. 예상 매도가에서 명도비·수리비·취득 부대비용·보유기간 이자와 인수할 보증금을 빼고, 목표 수익까지 뺀 금액이 입찰가 상한입니다. 감정평가는 매각기일보다 여러 달 앞서 이루어지므로 시세와 다를 수 있습니다.`,
    },
    {
      q: `${region.name} 경매 상담을 받으려면 어떻게 하나요?`,
      a: `옆커폰부동산에듀는 대구 수성구에 있으며 053-281-0759로 전화 주시면 물건별 권리분석과 입찰가 산정을 안내해 드립니다. ${region.name} 물건도 동일하게 상담 가능합니다.`,
    },
  ];
}

export async function onRequestGet(context) {
  const { request, params } = context;
  const origin = originOf(request);
  const code = String(params.region || "").toLowerCase();
  const region = regionByCode(code);

  const notFound = (msg) =>
    html(
      page({
        origin,
        path: `/area/${encodeURIComponent(code)}`,
        title: "준비 중인 지역입니다 | " + SITE.name,
        description: "아직 이 지역의 경매 물건이 준비되지 않았습니다.",
        noindex: true,
        body: `<section class="pg-head"><div class="pg-wrap">
            <h1>준비 중인 지역입니다</h1>
            <p class="pg-lead">${esc(msg)}</p>
          </div></section>
          <section class="pg-section"><div class="pg-wrap">
            <div class="pg-actions"><a class="button button-dark" href="/area">지금 볼 수 있는 지역 보기</a></div>
          </div></section>`,
      }),
      404,
      { "cache-control": "no-store" }
    );

  if (!region) return notFound("주소를 다시 확인해 주세요.");

  let all;
  try {
    all = await getProperties(context);
  } catch {
    return html(
      page({
        origin,
        path: `/area/${code}`,
        title: `${region.name} 경매 물건 | ${SITE.name}`,
        description: "일시적으로 물건 정보를 불러오지 못했습니다.",
        noindex: true,
        body: `<section class="pg-head"><div class="pg-wrap">
          <h1>물건 정보를 잠시 불러올 수 없습니다</h1>
          <p class="pg-lead">잠시 후 다시 시도해 주세요.</p></div></section>`,
      }),
      503,
      { "cache-control": "no-store", "retry-after": "300" }
    );
  }

  const groups = groupByRegion(all);
  const mine = groups.find((g) => g.region.code === code);
  const items = mine ? mine.items : [];

  if (items.length < MIN_PROPERTIES_PER_REGION) {
    return notFound(
      `${region.name} 지역 물건은 아직 ${items.length}건이라 페이지를 열지 않았습니다. ${MIN_PROPERTIES_PER_REGION}건 이상 모이면 자동으로 공개됩니다.`
    );
  }

  const kind = dominantKind(items) || "부동산";
  const heading = `${region.name} ${kind} 경매 물건`;
  const subs = [...new Set(items.map((p) => p.subRegion).filter(Boolean))];
  const openGroups = groups.filter((g) => g.items.length >= MIN_PROPERTIES_PER_REGION);
  const faq = regionFaq(region, items, kind, subs);
  const guideLinks = GUIDES.slice(0, 3)
    .map((g) => `<a class="pg-chip" href="/guide/${g.slug}">${esc(g.h1)}</a>`)
    .join("");

  const body = `
<section class="pg-head">
  <div class="pg-wrap">
    <nav class="pg-crumbs" aria-label="현재 위치">
      <a href="/">홈</a> <span>›</span> <a href="/area">지역별 물건</a> <span>›</span> <em>${esc(region.name)}</em>
    </nav>
    <span class="pg-badge">진행 중 ${items.length}건</span>
    <h1>${esc(region.name)} <em>${esc(kind)} 경매 물건</em></h1>
    <p class="pg-lead">${esc(region.full)}에서 진행 중인 경매 물건을 정리했습니다.
    ${subs.length ? `현재 ${esc(subs.slice(0, 5).join(", "))} 일대 물건이 올라와 있습니다. ` : ""}
    각 물건은 실제 임장과 권리분석을 거쳐 블로그에 정리한 내용을 그대로 연결해 두었습니다.</p>
  </div>
</section>

${answerBlock(
  `${region.name} ${kind} 경매 물건, 지금 몇 건이나 있나요?`,
  `${esc(region.full)} 기준 현재 <b>${items.length}건</b>이 올라와 있습니다.` +
    (subs.length ? ` ${esc(subs.slice(0, 4).join(", "))} 일대가 중심입니다.` : "") +
    ` 모두 실제 임장과 권리분석을 거친 물건이며, 감정가·최저매각가와 함께 확인할 권리관계를 정리해 두었습니다. 물건은 새 분석 글이 올라오면 자동으로 갱신됩니다.`
)}

<section class="pg-section">
  <div class="pg-wrap">
    <div class="pg-kicker">Properties</div>
    <h2 class="pg-title">${esc(region.name)} 진행 중인 <em>경매 물건</em></h2>
    <p class="pg-desc">감정가·최저매각가는 블로그 분석 글에서 가져온 값입니다. 사건번호·매각기일 등 법원 정보는
    각 물건의 원문 링크에서 확인해 주세요.</p>
    ${propertyGrid(items)}
  </div>
</section>

<section class="pg-section ink">
  <div class="pg-wrap">
    <div class="pg-kicker">Guide</div>
    <h2 class="pg-title">${esc(region.name)}에서 <em>경매로 집 사기</em> 전에</h2>
    <p class="pg-desc">경매는 싸게 사는 방법이 아니라, <b>권리관계를 정확히 읽는 사람</b>이 이기는 방법입니다.
    최소한 아래 세 가지는 입찰 전에 반드시 확인하세요.</p>
    <ul class="pg-checks">
      <li><b>말소기준권리</b> — 등기부에서 어떤 권리가 낙찰 후에도 남는지 확인합니다. 여기서 대부분의 사고가 납니다.</li>
      <li><b>대항력 있는 임차인</b> — 전입신고일과 확정일자를 따져 보증금을 낙찰자가 떠안는지 확인합니다.</li>
      <li><b>현장 확인</b> — 실제 점유자, 관리비 체납, 건물 상태는 서류만으로 알 수 없습니다.</li>
    </ul>
    ${guideLinks ? `<div class="pg-chips">${guideLinks}</div>` : ""}
    <div class="pg-actions">
      <a class="button button-primary" href="${SITE.klass}" target="_blank" rel="noreferrer">권리분석 강의 보기</a>
      <a class="button button-outline-light" href="/guide">경매 가이드 전체 보기</a>
    </div>
  </div>
</section>

${faqSection(faq, `${region.name} 경매 자주 묻는 질문`)}

<section class="pg-section">
  <div class="pg-wrap">
    <div class="pg-kicker">Other regions</div>
    <h2 class="pg-title">다른 지역 <em>경매 물건</em></h2>
    ${regionLinks(openGroups, code) || '<p class="pg-desc">현재 다른 지역은 준비 중입니다.</p>'}
    <div class="pg-actions"><a class="button button-dark" href="/area">지역 전체 보기</a></div>
  </div>
</section>

${ctaSection()}`;

  const description = `${region.name} ${kind} 경매 물건 ${items.length}건. ${
    subs.length ? subs.slice(0, 3).join(", ") + " 등 " : ""
  }감정가·최저매각가와 권리분석 포인트를 함께 확인하세요.`;

  return html(
    page({
      origin,
      path: `/area/${code}`,
      title: `${heading} ${items.length}건 | ${SITE.name}`,
      description,
      keywords: `${region.name}경매,${region.name}${kind}경매,${region.name}아파트경매,부동산경매,경매물건`,
      image: items[0] && items[0].thumbnail ? items[0].thumbnail : undefined,
      jsonLd: [
        organizationLd(origin),
        breadcrumbLd(
          [
            { name: "홈", path: "/" },
            { name: "지역별 물건", path: "/area" },
            { name: `${region.name} 경매`, path: `/area/${code}` },
          ],
          origin
        ),
        itemListLd(items, origin),
        faqLd(faq),
      ],
      body,
    })
  );
}
