/* GET /guide/{글주소} — 경매 정보 가이드 (AEO/GEO 대응)
 *
 * 매물 페이지는 물건이 팔리면 가치가 사라지지만, 이런 설명 글은 몇 년간 계속 검색된다.
 * 또 ChatGPT·Perplexity·구글 AI 개요는 "질문에 답하는 문서"를 인용하므로
 * 맨 위 직답(answerBlock) → 근거 본문 → FAQ 순서로 배치하고,
 * 같은 내용을 FAQPage·Article 구조화 데이터로도 넣는다.
 */
import { SITE, esc, page, html, originOf, organizationLd, breadcrumbLd } from "../_lib/site.js";
import { GUIDE_UPDATED, guideBySlug, faqLd } from "../_lib/guides.js";
import { answerBlock, faqSection, guideCard, ctaSection } from "../_lib/ui.js";

/** 가이드 본문 한 덩어리. 콘텐츠는 우리가 쓴 신뢰 문자열이라 <b> 등을 그대로 둔다. */
function section(s, i) {
  const paras = (s.p || []).map((t) => `<p class="pg-body-p">${t}</p>`).join("\n");
  const ul = s.ul ? `<ul class="pg-checks">${s.ul.map((t) => `<li>${t}</li>`).join("")}</ul>` : "";
  const ol = s.ol ? `<ol class="pg-steps">${s.ol.map((t) => `<li>${t}</li>`).join("")}</ol>` : "";
  return `<section class="pg-section${i % 2 ? " alt" : ""}">
  <div class="pg-wrap pg-prose">
    <h2 class="pg-title">${esc(s.h)}</h2>
    ${paras}
    ${ol}
    ${ul}
  </div>
</section>`;
}

export async function onRequestGet(context) {
  const { request, params } = context;
  const origin = originOf(request);
  const slug = String(params.slug || "").toLowerCase();
  const g = guideBySlug(slug);

  if (!g) {
    return html(
      page({
        origin,
        path: `/guide/${encodeURIComponent(slug)}`,
        title: "찾을 수 없는 문서입니다 | " + SITE.name,
        description: "주소를 다시 확인해 주세요.",
        noindex: true,
        body: `<section class="pg-head"><div class="pg-wrap">
            <h1>찾을 수 없는 문서입니다</h1>
            <p class="pg-lead">주소가 바뀌었거나 잘못 입력되었을 수 있습니다.</p>
          </div></section>
          <section class="pg-section"><div class="pg-wrap">
            <div class="pg-actions"><a class="button button-dark" href="/guide">경매 가이드 전체 보기</a></div>
          </div></section>`,
      }),
      404,
      { "cache-control": "no-store" }
    );
  }

  const path = `/guide/${g.slug}`;
  const related = (g.related || []).map(guideBySlug).filter(Boolean);

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: g.title,
    description: g.description,
    url: origin + path,
    mainEntityOfPage: origin + path,
    inLanguage: "ko-KR",
    datePublished: GUIDE_UPDATED,
    dateModified: GUIDE_UPDATED,
    author: { "@id": origin + "/#organization" },
    publisher: { "@id": origin + "/#organization" },
    image: origin + SITE.ogImage,
    about: g.h1,
    // 음성 비서·AI 요약이 우선적으로 읽어갈 영역을 지정한다.
    speakable: { "@type": "SpeakableSpecification", cssSelector: [".pg-answer-a", "h1"] },
  };

  const body = `
<section class="pg-head">
  <div class="pg-wrap">
    <nav class="pg-crumbs" aria-label="현재 위치">
      <a href="/">홈</a> <span>›</span> <a href="/guide">경매 가이드</a> <span>›</span> <em>${esc(g.h1)}</em>
    </nav>
    <span class="pg-badge">${esc(g.kicker)}</span>
    <h1>${esc(g.h1)}</h1>
    <p class="pg-lead">${esc(g.lead)}</p>
    <p class="pg-updated">최종 확인 ${esc(GUIDE_UPDATED)} · ${esc(SITE.name)}</p>
  </div>
</section>

${answerBlock(g.title, g.answer)}

${(g.sections || []).map(section).join("\n")}

${faqSection(g.faq)}

${related.length ? `<section class="pg-section">
  <div class="pg-wrap">
    <div class="pg-kicker">Next</div>
    <h2 class="pg-title">이어서 읽으면 좋은 <em>글</em></h2>
    <div class="pg-guides">${related.map(guideCard).join("\n")}</div>
  </div>
</section>` : ""}

<section class="pg-section alt">
  <div class="pg-wrap">
    <div class="pg-kicker">Properties</div>
    <h2 class="pg-title">지금 진행 중인 <em>경매 물건</em></h2>
    <p class="pg-desc">글로만 보면 잘 안 잡힙니다. 실제 물건에 위 내용을 대입해 보세요.</p>
    <div class="pg-actions"><a class="button button-dark" href="/area">지역별 경매 물건 보기</a></div>
  </div>
</section>

${ctaSection()}`;

  return html(
    page({
      origin,
      path,
      title: `${g.title} | ${SITE.name}`,
      description: g.description,
      keywords: g.keywords,
      jsonLd: [
        organizationLd(origin),
        breadcrumbLd(
          [{ name: "홈", path: "/" }, { name: "경매 가이드", path: "/guide" }, { name: g.h1, path }],
          origin
        ),
        articleLd,
        faqLd(g.faq),
      ],
      body,
    })
  );
}
