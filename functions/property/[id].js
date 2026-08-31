/* GET /property/{글번호} — 매물 상세 (서버에서 HTML을 완성해 내려준다)
 *
 * 기존 property.html 은 자바스크립트로 내용을 그려서 네이버 크롤러가 읽지 못했다.
 * 검색에 걸려야 하는 페이지라 서버 렌더로 옮겼다.
 */
import { SITE, esc, page, html, originOf, organizationLd, breadcrumbLd } from "../_lib/site.js";
import { getProperties } from "../_lib/properties.js";
import { propertyCard, propertyLabel, propertyUrl, ctaSection } from "../_lib/ui.js";

function infoRow(label, value) {
  if (!value) return "";
  return `<div class="row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

function gallery(p) {
  if (!p.images || !p.images.length) {
    return `<div class="detail-gallery"></div>`;
  }
  const thumbs = p.images
    .slice(0, 12)
    .map((src, i) =>
      `<img class="gallery-thumb${i === 0 ? " active" : ""}" src="${esc(src)}" alt="${esc(p.title)} 사진 ${i + 1}" loading="lazy" referrerpolicy="no-referrer" data-i="${i}">`
    )
    .join("");
  return `<div class="detail-gallery"><img id="main-photo" src="${esc(p.images[0])}" alt="${esc(p.title)}" referrerpolicy="no-referrer"></div>
    ${p.images.length > 1 ? `<div class="gallery-thumbs">${thumbs}</div>
    <script>
      document.querySelectorAll('.gallery-thumb').forEach(function(t){
        t.addEventListener('click', function(){
          document.getElementById('main-photo').src = t.src;
          document.querySelectorAll('.gallery-thumb').forEach(function(x){ x.classList.remove('active'); });
          t.classList.add('active');
        });
      });
    </script>` : ""}`;
}

export async function onRequestGet(context) {
  const { request, params } = context;
  const origin = originOf(request);
  const id = decodeURIComponent(String(params.id || ""));

  let items;
  try {
    items = await getProperties(context);
  } catch (err) {
    // 네이버 RSS를 못 읽은 상태. 404로 처리하면 검색엔진이 페이지를 지워버리므로 503으로 알린다.
    return html(
      page({
        origin,
        path: `/property/${encodeURIComponent(id)}`,
        title: "매물 정보를 불러오지 못했습니다 | " + SITE.name,
        description: "일시적으로 매물 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        noindex: true,
        body: `<section><div class="wrap"><h1 class="title">매물 정보를 잠시 불러올 수 없습니다</h1>
          <p class="desc">잠시 후 다시 시도해 주세요. 급하시면 <a class="gold" href="tel:${SITE.tel}">${SITE.tel}</a> 로 전화 주시면 바로 안내해 드립니다.</p>
          <p style="margin-top:18px"><a class="btn btn-dark" href="/">매물 목록으로</a></p></div></section>`,
      }),
      503,
      { "cache-control": "no-store", "retry-after": "300" }
    );
  }

  const p = items.find((x) => String(x.id) === id);

  if (!p) {
    return html(
      page({
        origin,
        path: `/property/${encodeURIComponent(id)}`,
        title: "찾을 수 없는 매물입니다 | " + SITE.name,
        description: "요청하신 매물을 찾을 수 없습니다. 진행 중인 다른 경매 매물을 확인해 보세요.",
        noindex: true,
        body: `<section><div class="wrap"><h1 class="title">찾을 수 없는 매물입니다</h1>
          <p class="desc">이미 마감되었거나 주소가 잘못되었을 수 있습니다.</p>
          <p style="margin-top:18px"><a class="btn btn-dark" href="/">진행 중인 매물 보기</a></p></div></section>`,
      }),
      404,
      { "cache-control": "no-store" }
    );
  }

  const area = [p.region, p.subRegion].filter(Boolean).join(" ");
  const pageTitle = `${p.title} | ${SITE.name}`;
  const descParts = [
    area ? `${area} ${p.category}` : p.category,
    p.address,
    p.appraisal ? `감정가 ${p.appraisal}` : "",
    p.minBid ? `최저가 ${p.minBid}` : "",
    "실전 권리분석과 함께 확인하세요.",
  ].filter(Boolean);

  // 같은 지역의 다른 매물 — 내부 링크를 만들어 검색엔진이 다음 페이지로 넘어가게 한다.
  const related = items.filter((x) => x.id !== p.id && x.regionCode && x.regionCode === p.regionCode).slice(0, 3);

  const crumbs = [{ name: "홈", path: "/" }];
  if (p.regionCode) crumbs.push({ name: `${p.region} 경매`, path: `/area/${p.regionCode}` });
  crumbs.push({ name: p.title, path: propertyUrl(p) });

  const listingLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: p.title,
    url: origin + propertyUrl(p),
    description: descParts.join(" · "),
    datePosted: p.pubDate ? new Date(p.pubDate).toISOString() : undefined,
    image: (p.images || []).slice(0, 5),
    mainEntityOfPage: origin + propertyUrl(p),
    provider: { "@id": origin + "/#organization" },
    ...(area
      ? {
          spatialCoverage: {
            "@type": "Place",
            address: { "@type": "PostalAddress", addressRegion: p.regionFull || p.region, addressLocality: p.subRegion || undefined, addressCountry: "KR" },
          },
        }
      : {}),
  };

  const body = `
<section class="hero">
  <div class="wrap">
    <nav class="crumbs" aria-label="현재 위치">
      <a href="/">홈</a> ${p.regionCode ? `<span>›</span> <a href="/area/${p.regionCode}">${esc(p.region)} 경매</a>` : ""}
      <span>›</span> <em>${esc(p.title)}</em>
    </nav>
    <span class="kick-badge">${esc(propertyLabel(p))}</span>
    <h1>${esc(p.title)}</h1>
    ${p.address ? `<p class="lead">${esc(p.address)}</p>` : ""}
  </div>
</section>

<section>
  <div class="wrap">
    <div class="detail-grid">
      <div>
        ${gallery(p)}
      </div>
      <div class="detail-info">
        <h2 style="margin:0 0 12px;font-size:19px">매물 정보</h2>
        ${infoRow("지역", area)}
        ${infoRow("종류", p.category)}
        ${infoRow("소재지", p.address)}
        ${infoRow("감정가", p.appraisal)}
        ${infoRow("최저매각가", p.minBid)}
        ${infoRow("등록일", p.pubDate ? new Date(p.pubDate).toLocaleDateString("ko-KR") : "")}
        <p class="desc" style="font-size:13.5px;margin:14px 0 0">
          사건번호·매각기일·보증금·등기부 내역은 블로그 원문에 이미지로 정리되어 있습니다.
          정확한 수치는 반드시 원문과 법원경매정보에서 확인해 주세요.
        </p>
        <div class="cta">
          <a class="btn btn-gold" href="tel:${SITE.tel}">전화로 물어보기</a>
          <a class="btn btn-out" href="${esc(p.link)}" target="_blank" rel="noopener">블로그 원문 보기</a>
          <a class="btn btn-out" href="/checkout.html">자료·컨설팅 신청</a>
        </div>
      </div>
    </div>

    ${p.summary ? `<p class="desc" style="margin-top:26px;max-width:78ch">${esc(p.summary)}…</p>` : ""}
  </div>
</section>

${related.length ? `<section>
  <div class="wrap">
    <div class="kicker">Nearby</div>
    <h2 class="title">${esc(p.region)}의 <span class="gold">다른 경매 매물</span></h2>
    <div class="prop-grid" style="margin-top:18px">${related.map(propertyCard).join("\n")}</div>
    <p style="margin-top:20px"><a class="btn btn-dark" href="/area/${p.regionCode}">${esc(p.region)} 경매 매물 전체 보기</a></p>
  </div>
</section>` : ""}

${ctaSection()}`;

  return html(
    page({
      origin,
      path: propertyUrl(p),
      title: pageTitle,
      description: descParts.join(" · "),
      image: p.thumbnail || undefined,
      jsonLd: [organizationLd(origin), breadcrumbLd(crumbs, origin), listingLd],
      body,
    })
  );
}
