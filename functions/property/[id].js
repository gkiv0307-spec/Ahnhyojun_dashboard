/* GET /property/{글번호} — 매물 상세 (서버에서 HTML을 완성해 내려준다)
 *
 * 네이버 크롤러는 자바스크립트를 거의 읽지 못하므로, 검색에 걸려야 하는 내용은
 * 전부 서버에서 만든 HTML 안에 글자로 들어가 있어야 한다.
 */
import { SITE, esc, page, html, originOf, organizationLd, breadcrumbLd } from "../_lib/site.js";
import { getProperties } from "../_lib/properties.js";
import { propertyCard, propertyLabel, propertyUrl, ctaSection } from "../_lib/ui.js";

function infoRow(label, value) {
  if (!value) return "";
  return `<div class="pg-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

function gallery(p) {
  if (!p.images || !p.images.length) return `<div class="pg-photo"></div>`;

  const thumbs = p.images
    .slice(0, 12)
    .map((src, i) =>
      `<img class="pg-thumb${i === 0 ? " active" : ""}" src="${esc(src)}" alt="${esc(p.title)} 사진 ${i + 1}" loading="lazy" referrerpolicy="no-referrer">`
    )
    .join("");

  const script = `<script>
      document.querySelectorAll('.pg-thumb').forEach(function(t){
        t.addEventListener('click', function(){
          document.getElementById('pg-main-photo').src = t.src;
          document.querySelectorAll('.pg-thumb').forEach(function(x){ x.classList.remove('active'); });
          t.classList.add('active');
        });
      });
    </script>`;

  return `<div class="pg-photo"><img id="pg-main-photo" src="${esc(p.images[0])}" alt="${esc(p.title)}" referrerpolicy="no-referrer"></div>
    ${p.images.length > 1 ? `<div class="pg-thumbs">${thumbs}</div>${script}` : ""}`;
}

function errorPage({ origin, path, title, heading, message }) {
  return page({
    origin,
    path,
    title,
    description: message,
    noindex: true,
    body: `<section class="pg-head"><div class="pg-wrap">
        <h1>${esc(heading)}</h1>
        <p class="pg-lead">${esc(message)}</p>
      </div></section>
      <section class="pg-section"><div class="pg-wrap">
        <div class="pg-actions">
          <a class="button button-dark" href="/area">지역별 물건 보기</a>
          <a class="button button-primary" href="tel:${SITE.telHref}">전화상담 ${SITE.tel}</a>
        </div>
      </div></section>`,
  });
}

export async function onRequestGet(context) {
  const { request, params } = context;
  const origin = originOf(request);
  const id = decodeURIComponent(String(params.id || ""));
  const path = `/property/${encodeURIComponent(id)}`;

  let items;
  try {
    items = await getProperties(context);
  } catch {
    // 네이버 RSS를 못 읽은 상태. 404로 처리하면 검색엔진이 페이지를 지워버리므로 503으로 알린다.
    return html(
      errorPage({
        origin, path,
        title: "물건 정보를 불러오지 못했습니다 | " + SITE.name,
        heading: "물건 정보를 잠시 불러올 수 없습니다",
        message: `잠시 후 다시 시도해 주세요. 급하시면 ${SITE.tel} 로 전화 주시면 바로 안내해 드립니다.`,
      }),
      503,
      { "cache-control": "no-store", "retry-after": "300" }
    );
  }

  const p = items.find((x) => String(x.id) === id);

  if (!p) {
    return html(
      errorPage({
        origin, path,
        title: "찾을 수 없는 물건입니다 | " + SITE.name,
        heading: "찾을 수 없는 물건입니다",
        message: "이미 마감되었거나 주소가 잘못되었을 수 있습니다.",
      }),
      404,
      { "cache-control": "no-store" }
    );
  }

  const area = [p.region, p.subRegion].filter(Boolean).join(" ");
  const descParts = [
    area ? `${area} ${p.category}` : p.category,
    p.address,
    p.appraisal ? `감정가 ${p.appraisal}` : "",
    p.minBid ? `최저가 ${p.minBid}` : "",
    "실전 권리분석과 함께 확인하세요.",
  ].filter(Boolean);

  // 같은 지역의 다른 물건 — 내부 링크를 만들어 검색엔진이 다음 페이지로 넘어가게 한다.
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
            address: {
              "@type": "PostalAddress",
              addressRegion: p.regionFull || p.region,
              addressLocality: p.subRegion || undefined,
              addressCountry: "KR",
            },
          },
        }
      : {}),
  };

  const body = `
<section class="pg-head">
  <div class="pg-wrap">
    <nav class="pg-crumbs" aria-label="현재 위치">
      <a href="/">홈</a> ${p.regionCode ? `<span>›</span> <a href="/area/${p.regionCode}">${esc(p.region)} 경매</a>` : ""}
      <span>›</span> <em>${esc(p.title)}</em>
    </nav>
    <span class="pg-badge">${esc(propertyLabel(p))}</span>
    <h1>${esc(p.title)}</h1>
    ${p.address ? `<p class="pg-lead">${esc(p.address)}</p>` : ""}
  </div>
</section>

<section class="pg-section">
  <div class="pg-wrap">
    <div class="pg-detail">
      <div>${gallery(p)}</div>
      <div class="pg-info">
        <h2>물건 정보</h2>
        ${infoRow("지역", area)}
        ${infoRow("종류", p.category)}
        ${infoRow("소재지", p.address)}
        ${infoRow("감정가", p.appraisal)}
        ${infoRow("최저매각가", p.minBid)}
        ${infoRow("등록일", p.pubDate ? new Date(p.pubDate).toLocaleDateString("ko-KR") : "")}
        <p class="pg-note">사건번호·매각기일·보증금·등기부 내역은 블로그 원문에 이미지로 정리되어 있습니다.
        정확한 수치는 반드시 원문과 법원경매정보에서 확인해 주세요.</p>
        <div class="pg-cta">
          <a class="button button-primary" href="tel:${SITE.telHref}">전화로 물어보기</a>
          <a class="button button-dark" href="${esc(p.link)}" target="_blank" rel="noreferrer">블로그 원문 보기</a>
        </div>
      </div>
    </div>
    ${p.summary ? `<p class="pg-desc" style="margin-top:30px">${esc(p.summary)}…</p>` : ""}
  </div>
</section>

${related.length ? `<section class="pg-section alt">
  <div class="pg-wrap">
    <div class="pg-kicker">Nearby</div>
    <h2 class="pg-title">${esc(p.region)}의 <em>다른 경매 물건</em></h2>
    <div class="pg-grid">${related.map(propertyCard).join("\n")}</div>
    <div class="pg-actions"><a class="button button-dark" href="/area/${p.regionCode}">${esc(p.region)} 물건 전체 보기</a></div>
  </div>
</section>` : ""}

${ctaSection()}`;

  return html(
    page({
      origin,
      path: propertyUrl(p),
      title: `${p.title} | ${SITE.name}`,
      description: descParts.join(" · "),
      keywords: [area, p.category, "부동산경매", "경매물건"].filter(Boolean).join(","),
      image: p.thumbnail || undefined,
      jsonLd: [organizationLd(origin), breadcrumbLd(crumbs, origin), listingLd],
      body,
    })
  );
}
