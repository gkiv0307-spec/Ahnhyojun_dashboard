/* GET /type — 물건 유형별 허브
 * 지역 허브(/area)와 짝을 이루는 축. 아파트·상가·토지처럼 유형 단독 검색어를 받는다. */
import { SITE, esc, page, html, originOf, organizationLd, breadcrumbLd } from "../_lib/site.js";
import { getProperties, groupByType, MIN_PROPERTIES_PER_REGION } from "../_lib/properties.js";
import { ctaSection } from "../_lib/ui.js";

export async function onRequestGet(context) {
  const origin = originOf(context.request);

  let items = [];
  let failed = false;
  try {
    items = await getProperties(context);
  } catch {
    failed = true;
  }

  const groups = groupByType(items);
  const open = groups.filter((g) => g.items.length >= MIN_PROPERTIES_PER_REGION);
  const few = groups.filter((g) => g.items.length < MIN_PROPERTIES_PER_REGION);

  const cards = open
    .map(
      (g) => `<a class="pg-area-card" href="/type/${g.type.code}">
        <b>${esc(g.type.name)} 경매</b>
        <span>진행 중 <i>${g.items.length}</i>건</span>
        <u>${esc(g.type.name)} 물건 보기 →</u>
      </a>`
    )
    .join("\n");

  const fewList = few.length
    ? `<p class="pg-desc" style="margin-top:22px">준비 중인 유형: ${few
        .map((g) => `${esc(g.type.name)}(${g.items.length}건)`)
        .join(" · ")} — 물건이 ${MIN_PROPERTIES_PER_REGION}건 이상 쌓이면 페이지가 열립니다.</p>`
    : "";

  const listLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "물건 유형별 경매",
    numberOfItems: open.length,
    itemListElement: open.map((g, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${origin}/type/${g.type.code}`,
      name: `${g.type.name} 경매 물건`,
    })),
  };

  const body = `
<section class="pg-head">
  <div class="pg-wrap">
    <nav class="pg-crumbs" aria-label="현재 위치"><a href="/">홈</a> <span>›</span> <em>유형별 물건</em></nav>
    <span class="pg-badge">유형별 경매 물건</span>
    <h1>물건 <em>유형별 경매</em></h1>
    <p class="pg-lead">아파트·오피스텔·상가·토지는 보는 방법이 완전히 다릅니다.
    유형마다 어디서 사고가 나는지, 무엇을 먼저 확인해야 하는지 정리해 두었습니다.</p>
  </div>
</section>

<section class="pg-section">
  <div class="pg-wrap">
    <div class="pg-kicker">Types</div>
    <h2 class="pg-title">지금 볼 수 있는 <em>유형</em></h2>
    ${open.length
      ? `<div class="pg-areas">${cards}</div>`
      : `<p class="pg-desc">${failed ? "물건 정보를 잠시 불러올 수 없습니다. 잠시 후 다시 시도해 주세요." : "아직 공개된 유형이 없습니다. 블로그에 물건 분석 글이 올라오면 이곳에 자동으로 표시됩니다."}</p>`}
    ${fewList}
  </div>
</section>

<section class="pg-section alt">
  <div class="pg-wrap">
    <div class="pg-kicker">Guide</div>
    <h2 class="pg-title">유형을 정하기 전에 <em>권리분석부터</em></h2>
    <p class="pg-desc">어떤 유형이든 인수할 권리가 있는지 확인하는 순서는 같습니다.
    말소기준권리를 찾는 법부터 보시면 어떤 물건을 걸러야 하는지 기준이 생깁니다.</p>
    <div class="pg-actions">
      <a class="button button-dark" href="/guide">경매 가이드 보기</a>
      <a class="button button-outline" href="/area">지역별 물건 보기</a>
    </div>
  </div>
</section>

${ctaSection()}`;

  return html(
    page({
      origin,
      path: "/type",
      title: `유형별 부동산 경매 물건 (아파트·상가·토지) | ${SITE.name}`,
      description:
        "아파트·오피스텔·빌라·상가·토지 등 물건 유형별 진행 중인 경매 물건과 유형마다 확인해야 할 점을 정리했습니다.",
      keywords: "아파트경매,상가경매,토지경매,오피스텔경매,빌라경매,공장경매,경매물건검색",
      jsonLd: [
        organizationLd(origin),
        breadcrumbLd([{ name: "홈", path: "/" }, { name: "유형별 물건", path: "/type" }], origin),
        listLd,
      ],
      body,
    }),
    failed ? 503 : 200,
    failed ? { "cache-control": "no-store", "retry-after": "300" } : {}
  );
}
