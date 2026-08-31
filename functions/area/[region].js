/* GET /area/{지역코드} — 지역별 경매 매물 페이지
 *
 * "대구아파트경매", "부산아파트경매" 처럼 지역+키워드 검색을 잡기 위한 페이지.
 * 매물이 MIN_PROPERTIES_PER_REGION 건 미만인 지역은 내용이 빈약해 저품질로 평가되므로
 * 아예 열지 않는다(404). 매물이 쌓이면 자동으로 열린다.
 */
import { SITE, esc, page, html, originOf, organizationLd, breadcrumbLd, itemListLd } from "../_lib/site.js";
import { getProperties, groupByRegion, regionByCode, MIN_PROPERTIES_PER_REGION } from "../_lib/properties.js";
import { propertyGrid, regionLinks, ctaSection } from "../_lib/ui.js";

/** 그 지역 매물에서 가장 많은 종류를 골라 제목에 쓴다(예: "대구 아파트 경매"). */
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
        description: "아직 이 지역의 경매 매물이 준비되지 않았습니다.",
        noindex: true,
        body: `<section><div class="wrap"><h1 class="title">준비 중인 지역입니다</h1>
          <p class="desc">${esc(msg)}</p>
          <p style="margin-top:18px"><a class="btn btn-dark" href="/area">지금 볼 수 있는 지역 보기</a></p></div></section>`,
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
        title: `${region.name} 경매 매물 | ${SITE.name}`,
        description: "일시적으로 매물 정보를 불러오지 못했습니다.",
        noindex: true,
        body: `<section><div class="wrap"><h1 class="title">매물 정보를 잠시 불러올 수 없습니다</h1>
          <p class="desc">잠시 후 다시 시도해 주세요.</p></div></section>`,
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
      `${region.name} 지역 매물은 아직 ${items.length}건이라 페이지를 열지 않았습니다. ${MIN_PROPERTIES_PER_REGION}건 이상 모이면 자동으로 공개됩니다.`
    );
  }

  const kind = dominantKind(items) || "부동산";
  const heading = `${region.name} ${kind} 경매 매물`;
  const subs = [...new Set(items.map((p) => p.subRegion).filter(Boolean))];
  const openGroups = groups.filter((g) => g.items.length >= MIN_PROPERTIES_PER_REGION);

  const body = `
<section class="hero">
  <div class="wrap">
    <nav class="crumbs" aria-label="현재 위치">
      <a href="/">홈</a> <span>›</span> <a href="/area">지역별 경매</a> <span>›</span> <em>${esc(region.name)}</em>
    </nav>
    <span class="kick-badge">진행 중 ${items.length}건</span>
    <h1>${esc(heading)}</h1>
    <p class="lead">${esc(region.full)}에서 진행 중인 경매 물건을 정리했습니다.
    ${subs.length ? `현재 ${esc(subs.slice(0, 5).join(", "))} 일대 물건이 올라와 있습니다. ` : ""}
    각 물건은 실제 임장과 권리분석을 거쳐 블로그에 정리한 내용을 그대로 연결해 두었습니다.</p>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="kicker">Properties</div>
    <h2 class="title">${esc(region.name)} 진행 중인 <span class="gold">경매 물건</span></h2>
    <p class="desc">감정가·최저매각가는 블로그 분석 글에서 추출한 값입니다. 사건번호·매각기일 등 법원 정보는
    각 매물의 원문 링크에서 확인해 주세요.</p>
    <div style="margin-top:22px">${propertyGrid(items)}</div>
  </div>
</section>

<section class="dark">
  <div class="wrap">
    <div class="kicker">Guide</div>
    <h2 class="title">${esc(region.name)}에서 <span class="gold">경매로 집 사기</span> 전에</h2>
    <p class="desc">경매는 싸게 사는 방법이 아니라, <b style="color:#fff">권리관계를 정확히 읽는 사람</b>이 이기는 방법입니다.
    최소한 아래 세 가지는 입찰 전에 반드시 확인하세요.</p>
    <ul class="check-list">
      <li><b>말소기준권리</b> — 등기부에서 어떤 권리가 낙찰 후에도 남는지 확인합니다. 여기서 대부분의 사고가 납니다.</li>
      <li><b>대항력 있는 임차인</b> — 전입신고일과 확정일자를 따져 보증금을 낙찰자가 떠안는지 확인합니다.</li>
      <li><b>현장 확인</b> — 실제 점유자, 관리비 체납, 건물 상태는 서류만으로 알 수 없습니다.</li>
    </ul>
    <p style="margin-top:20px"><a class="btn btn-gold" href="/courses.html">권리분석 강의 보기</a></p>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="kicker">Other regions</div>
    <h2 class="title">다른 지역 <span class="gold">경매 매물</span></h2>
    ${regionLinks(openGroups, code) || '<p class="desc">현재 다른 지역은 준비 중입니다.</p>'}
    <p style="margin-top:18px"><a class="btn btn-dark" href="/area">지역 전체 보기</a></p>
  </div>
</section>

${ctaSection()}`;

  const description = `${region.name} ${kind} 경매 매물 ${items.length}건. ${
    subs.length ? subs.slice(0, 3).join(", ") + " 등 " : ""
  }감정가·최저매각가와 권리분석 포인트를 함께 확인하세요.`;

  return html(
    page({
      origin,
      path: `/area/${code}`,
      title: `${heading} ${items.length}건 | ${SITE.name}`,
      description,
      image: items[0] && items[0].thumbnail ? items[0].thumbnail : undefined,
      jsonLd: [
        organizationLd(origin),
        breadcrumbLd(
          [
            { name: "홈", path: "/" },
            { name: "지역별 경매", path: "/area" },
            { name: `${region.name} 경매`, path: `/area/${code}` },
          ],
          origin
        ),
        itemListLd(items, origin),
      ],
      body,
    })
  );
}
