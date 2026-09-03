/* GET /guide — 경매 가이드 허브
 * "경매 권리분석", "경매 절차" 같은 정보성 검색어를 잡는 글들의 목차이자,
 * 검색엔진이 각 가이드로 걸어 들어가는 통로다. */
import { SITE, esc, page, html, originOf, organizationLd, breadcrumbLd } from "../_lib/site.js";
import { GUIDES, SITE_FAQ, faqLd } from "../_lib/guides.js";
import { guideCard, faqSection, ctaSection } from "../_lib/ui.js";

export async function onRequestGet(context) {
  const origin = originOf(context.request);

  const listLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "부동산 경매 가이드",
    numberOfItems: GUIDES.length,
    itemListElement: GUIDES.map((g, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${origin}/guide/${g.slug}`,
      name: g.h1,
    })),
  };

  const body = `
<section class="pg-head">
  <div class="pg-wrap">
    <nav class="pg-crumbs" aria-label="현재 위치"><a href="/">홈</a> <span>›</span> <em>경매 가이드</em></nav>
    <span class="pg-badge">경매 가이드</span>
    <h1>부동산 경매 <em>기초부터 명도까지</em></h1>
    <p class="pg-lead">실제로 낙찰받고 명도까지 해 본 사람이 정리한 순서입니다.
    권리분석에서 무엇을 보는지, 입찰가를 어떻게 계산하는지, 낙찰 후에 무엇을 해야 하는지 차례로 담았습니다.</p>
  </div>
</section>

<section class="pg-section">
  <div class="pg-wrap">
    <div class="pg-kicker">Guides</div>
    <h2 class="pg-title">읽는 <em>순서</em></h2>
    <p class="pg-desc">처음이시라면 위에서부터 차례대로 보시면 됩니다.</p>
    <div class="pg-guides">${GUIDES.map(guideCard).join("\n")}</div>
  </div>
</section>

${faqSection(SITE_FAQ, "경매에 대해 가장 많이 받는 질문")}

<section class="pg-section">
  <div class="pg-wrap">
    <div class="pg-kicker">Properties</div>
    <h2 class="pg-title">읽었다면 <em>실제 물건</em>에 대입해 보세요</h2>
    <p class="pg-desc">저희가 임장과 권리분석을 거쳐 정리한 지역별 진행 물건입니다.</p>
    <div class="pg-actions">
      <a class="button button-dark" href="/area">지역별 경매 물건 보기</a>
      <a class="button button-outline" href="${SITE.blog}" target="_blank" rel="noreferrer">블로그 최신 분석</a>
    </div>
  </div>
</section>

${ctaSection()}`;

  return html(
    page({
      origin,
      path: "/guide",
      title: `부동산 경매 가이드 — 권리분석·입찰·명도 정리 | ${SITE.name}`,
      description:
        "말소기준권리, 대항력 있는 임차인, 입찰 절차와 입찰가 산정, 명도까지. 실제 낙찰 경험을 바탕으로 정리한 부동산 경매 기초 가이드입니다.",
      keywords: "부동산경매가이드,경매권리분석,말소기준권리,대항력임차인,경매입찰절차,명도절차,경매초보",
      jsonLd: [
        organizationLd(origin),
        breadcrumbLd([{ name: "홈", path: "/" }, { name: "경매 가이드", path: "/guide" }], origin),
        listLd,
        faqLd(SITE_FAQ),
      ],
      body,
    })
  );
}
