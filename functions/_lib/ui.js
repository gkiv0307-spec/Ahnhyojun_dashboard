/* 서버 렌더 페이지에서 공용으로 쓰는 조각들 (매물 카드 등)
 * 클래스는 랜딩 CSS와 부딪히지 않도록 전부 `pg-` 로 시작한다. */
import { SITE, esc } from "./site.js";

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
  const price =
    p.appraisal || p.minBid
      ? `<div class="pg-price">${p.appraisal ? `<span>감정가 <b>${esc(p.appraisal)}</b></span>` : ""}${p.minBid ? `<span>최저가 <b>${esc(p.minBid)}</b></span>` : ""}</div>`
      : `<div class="pg-price"><span>가격은 상세에서 확인</span></div>`;

  return `<a class="pg-card" href="${propertyUrl(p)}">
      <div class="pg-card-photo">${thumb}</div>
      <div class="pg-card-body">
        <div class="pg-tag">${esc(propertyLabel(p))}</div>
        <h3>${esc(p.title)}</h3>
        ${p.address ? `<p class="pg-card-addr">${esc(p.address)}</p>` : ""}
        ${price}
        <div class="pg-more">자세히 보기 →</div>
      </div>
    </a>`;
}

export function propertyGrid(items) {
  if (!items.length) return `<div class="pg-empty">등록된 매물이 없습니다.</div>`;
  return `<div class="pg-grid">${items.map(propertyCard).join("\n")}</div>`;
}

/** 다른 지역으로 넘어갈 수 있는 링크 줄 — 내부 링크가 있어야 검색엔진이 페이지를 찾아간다. */
export function regionLinks(groups, currentCode) {
  const links = groups
    .filter((g) => g.region.code !== currentCode)
    .map((g) => `<a class="pg-chip" href="/area/${g.region.code}">${esc(g.region.name)} 경매 <span>${g.items.length}</span></a>`);
  if (!links.length) return "";
  return `<div class="pg-chips">${links.join("")}</div>`;
}

export function ctaSection() {
  return `<section class="pg-section ink">
  <div class="pg-wrap pg-center">
    <div class="pg-kicker">Consulting</div>
    <h2 class="pg-title">이 물건, <em>낙찰받아도 될까요?</em></h2>
    <p class="pg-desc">권리분석·현장조사·입찰가 산정까지, 직접 낙찰받아 본 사람이 끝까지 봐 드립니다.</p>
    <div class="pg-actions">
      <a class="button button-primary" href="tel:${SITE.telHref}">전화상담 ${SITE.tel}</a>
      <a class="button button-outline-light" href="${SITE.klass}" target="_blank" rel="noreferrer">온라인 강의 보기</a>
    </div>
  </div>
</section>`;
}
