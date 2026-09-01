/* GET /area — 지역별 경매 매물 허브
 *
 * 홈(랜딩)의 매물 섹션은 손으로 넣은 이미지라 검색엔진이 개별 물건을 따라갈 수 없다.
 * 이 페이지가 "검색엔진이 각 매물 페이지까지 걸어 들어가는 통로" 역할을 한다.
 */
import { SITE, esc, page, html, originOf, organizationLd, breadcrumbLd } from "../_lib/site.js";
import { getProperties, groupByRegion, MIN_PROPERTIES_PER_REGION } from "../_lib/properties.js";
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

  const groups = groupByRegion(items);
  const open = groups.filter((g) => g.items.length >= MIN_PROPERTIES_PER_REGION);
  const few = groups.filter((g) => g.items.length < MIN_PROPERTIES_PER_REGION);

  const cards = open
    .map(
      (g) => `<a class="pg-area-card" href="/area/${g.region.code}">
        <b>${esc(g.region.name)} 경매</b>
        <span>진행 중 <i>${g.items.length}</i>건</span>
        <u>${esc(g.region.name)} 물건 보기 →</u>
      </a>`
    )
    .join("\n");

  const fewList = few.length
    ? `<p class="pg-desc" style="margin-top:22px">준비 중인 지역: ${few
        .map((g) => `${esc(g.region.name)}(${g.items.length}건)`)
        .join(" · ")} — 물건이 ${MIN_PROPERTIES_PER_REGION}건 이상 쌓이면 지역 페이지가 열립니다.</p>`
    : "";

  const body = `
<section class="pg-head">
  <div class="pg-wrap">
    <nav class="pg-crumbs" aria-label="현재 위치"><a href="/">홈</a> <span>›</span> <em>지역별 물건</em></nav>
    <span class="pg-badge">지역별 경매 물건</span>
    <h1>지역별 <em>부동산 경매 물건</em></h1>
    <p class="pg-lead">대구를 시작으로 경북·부산·경남 등 전국 경매 물건을 순차적으로 올리고 있습니다.
    보고 싶은 지역을 눌러 진행 중인 물건과 실제 낙찰 사례를 확인하세요.</p>
  </div>
</section>

<section class="pg-section">
  <div class="pg-wrap">
    <div class="pg-kicker">Regions</div>
    <h2 class="pg-title">지금 볼 수 있는 <em>지역</em></h2>
    ${open.length
      ? `<div class="pg-areas">${cards}</div>`
      : `<p class="pg-desc">${failed ? "물건 정보를 잠시 불러올 수 없습니다. 잠시 후 다시 시도해 주세요." : "아직 공개된 지역이 없습니다. 블로그에 물건 분석 글이 올라오면 이곳에 자동으로 표시됩니다."}</p>`}
    ${fewList}
  </div>
</section>

<section class="pg-section alt">
  <div class="pg-wrap">
    <div class="pg-kicker">How it works</div>
    <h2 class="pg-title">물건은 <em>블로그에서 자동으로</em> 올라옵니다</h2>
    <p class="pg-desc">옆커폰부동산에듀 블로그에 경매 물건 분석 글이 올라오면 지역·종류를 자동으로 분류해
    이 사이트에 반영합니다. 사건번호·매각기일 같은 법원 정보는 원문 글에서 확인하실 수 있습니다.</p>
    <div class="pg-actions">
      <a class="button button-dark" href="${SITE.blog}" target="_blank" rel="noreferrer">블로그에서 최신 분석 보기</a>
    </div>
  </div>
</section>

${ctaSection()}`;

  return html(
    page({
      origin,
      path: "/area",
      title: "지역별 부동산 경매 물건 (대구·경북·부산·경남) | " + SITE.name,
      description:
        "대구 아파트 경매를 비롯해 지역별 진행 중인 부동산 경매 물건을 모아봅니다. 감정가·최저매각가와 실제 권리분석까지 함께 확인하세요.",
      keywords: "지역별경매,대구아파트경매,부산아파트경매,경남아파트경매,경북경매,부동산경매물건",
      jsonLd: [
        organizationLd(origin),
        breadcrumbLd([{ name: "홈", path: "/" }, { name: "지역별 물건", path: "/area" }], origin),
      ],
      body,
    }),
    failed ? 503 : 200,
    failed ? { "cache-control": "no-store", "retry-after": "300" } : {}
  );
}
