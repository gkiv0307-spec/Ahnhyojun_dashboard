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

/* ── AEO(답변형 검색) 조각 ──────────────────────────────
 * ChatGPT·Perplexity·구글 AI 개요는 페이지 앞부분의 "질문에 대한 직답"과
 * FAQ 블록을 우선적으로 읽어 인용한다. 그래서 결론을 맨 위에 두고,
 * 질문/답변을 사람이 읽는 HTML과 구조화 데이터 양쪽에 넣는다. */

/** 페이지 맨 위의 한 문단 직답. answerHtml 은 <b> 정도만 허용된 신뢰 문자열이다. */
export function answerBlock(question, answerHtml) {
  return `<section class="pg-answer" aria-label="요약 답변">
  <div class="pg-wrap">
    <p class="pg-answer-q">${esc(question)}</p>
    <p class="pg-answer-a">${answerHtml}</p>
  </div>
</section>`;
}

/** 사람이 읽는 FAQ 목록. 같은 내용을 faqLd() 로 구조화 데이터에도 넣어야 한다. */
export function faqSection(faq, heading = "자주 묻는 질문") {
  if (!faq || !faq.length) return "";
  const items = faq
    .map(
      (f) => `<details class="pg-faq-item">
        <summary>${esc(f.q)}</summary>
        <p>${esc(f.a)}</p>
      </details>`
    )
    .join("\n");
  return `<section class="pg-section alt">
  <div class="pg-wrap">
    <div class="pg-kicker">FAQ</div>
    <h2 class="pg-title">${esc(heading)}</h2>
    <div class="pg-faq">${items}</div>
  </div>
</section>`;
}

/** 가이드 글 카드 — 가이드 목록과 관련글 영역에서 함께 쓴다. */
export function guideCard(g) {
  return `<a class="pg-guide-card" href="/guide/${g.slug}">
      <span class="pg-tag">${esc(g.kicker)}</span>
      <h3>${esc(g.h1)}</h3>
      <p>${esc(g.lead)}</p>
      <u>읽어보기 →</u>
    </a>`;
}
