/* 서버 렌더 페이지에서 공용으로 쓰는 조각들 (매물 카드 등) */
import { esc } from "./site.js";

export function propertyUrl(p) {
  return "/property/" + encodeURIComponent(p.id);
}

export function propertyLabel(p) {
  const area = [p.region, p.subRegion].filter(Boolean).join(" ");
  return [area || "전국", p.category || "경매매물"].join(" · ");
}

export function propertyCard(p) {
  const thumb = p.thumbnail
    ? `<img src="${esc(p.thumbnail)}" alt="${esc(p.title)}" loading="lazy" referrerpolicy="no-referrer">`
    : "";
  const priceRow =
    p.appraisal || p.minBid
      ? `<div class="price-row">${p.appraisal ? `<span>감정가 <b>${esc(p.appraisal)}</b></span>` : ""}${p.minBid ? `<span>최저가 <b>${esc(p.minBid)}</b></span>` : ""}</div>`
      : `<div class="price-row"><span>가격은 상세에서 확인</span></div>`;
  const addressLine = p.address
    ? `<div class="desc" style="font-size:13px;margin:0">${esc(p.address)}</div>`
    : "";

  return `<a class="prop-card" href="${propertyUrl(p)}">
      <div class="ph">${thumb}</div>
      <div class="pc">
        <div class="tag">${esc(propertyLabel(p))}</div>
        <h3>${esc(p.title)}</h3>
        ${addressLine}
        ${priceRow}
        <div class="more">자세히 보기 →</div>
      </div>
    </a>`;
}

export function propertyGrid(items) {
  if (!items.length) return `<div class="state-msg">등록된 매물이 없습니다.</div>`;
  return `<div class="prop-grid">${items.map(propertyCard).join("\n")}</div>`;
}

/** 다른 지역으로 넘어갈 수 있는 링크 줄 — 내부 링크가 있어야 검색엔진이 페이지를 찾아간다. */
export function regionLinks(groups, currentCode) {
  const links = groups
    .filter((g) => g.region.code !== currentCode)
    .map((g) => `<a class="region-chip" href="/area/${g.region.code}">${esc(g.region.name)} 경매 <span>${g.items.length}</span></a>`);
  if (!links.length) return "";
  return `<div class="region-chips">${links.join("")}</div>`;
}

export function ctaSection() {
  return `<section class="dark">
  <div class="wrap" style="text-align:center">
    <div class="kicker">상담 안내</div>
    <h2 class="title">물건 분석이 어려우시면 <span class="gold">직접 물어보세요</span></h2>
    <p class="desc" style="margin:0 auto 22px">권리분석·현장조사·입찰가 산정까지, 실제 낙찰 경험을 바탕으로 상담해 드립니다.</p>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
      <a class="btn btn-gold" href="tel:010-6419-0759">전화상담 010-6419-0759</a>
      <a class="btn btn-out" href="/courses.html">경매 강의 살펴보기</a>
    </div>
  </div>
</section>`;
}
