/* 사이트 공통 정보 + 서버 렌더 페이지의 HTML 골격
 *
 * functions/ 안에서 `_` 로 시작하는 폴더는 라우트로 잡히지 않는다(핸들러를 export 하지 않으므로).
 * 정적 HTML 페이지들과 머리말/꼬리말 마크업을 맞춰 둔다.
 */

export const SITE = {
  name: "옆커폰부동산에듀",
  legalName: "(주)옆커폰부동산에듀",
  origin: "https://xn--289av8kwmfs4dv2e.store", // 부동산경매.store
  displayDomain: "부동산경매.store",
  ceo: "고호정",
  bizNo: "882-88-03372",
  tel: "010-6419-0759",
  tel2: "053-281-0759",
  email: "rhghwjd12@naver.com",
  address: {
    street: "수성구 두산동 207-5, 2층 204호",
    city: "대구광역시",
    country: "KR",
  },
  blog: "https://blog.naver.com/ykphone_edu",
  klass: "https://gkinvestment.liveklass.com",
  ogImage: "/assets/og-cover.png",
};

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/** 요청이 들어온 실제 도메인 기준 절대주소(미리보기 도메인에서도 링크가 깨지지 않게). */
export function originOf(request) {
  try {
    const u = new URL(request.url);
    if (/\.pages\.dev$/.test(u.hostname) || u.hostname === "localhost" || /^127\./.test(u.hostname)) {
      return u.origin;
    }
  } catch {}
  return SITE.origin;
}

/** 검색결과에 그대로 노출되는 문구라 길이를 지켜 자른다. */
function clampDesc(s) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > 155 ? t.slice(0, 154) + "…" : t;
}

const NAV = [
  ["/", "매물정보"],
  ["/area", "지역별 경매"],
  ["/about.html", "회사소개"],
  ["/courses.html", "강의안내"],
  ["/reviews.html", "수강생후기"],
];

/**
 * 서버에서 완성된 HTML을 만들어 준다.
 * 네이버 크롤러는 자바스크립트를 거의 실행하지 않으므로, 검색에 걸려야 하는 내용은
 * 반드시 이 함수를 통해 HTML 안에 글자로 들어가 있어야 한다.
 */
export function page({ title, description, path, body, jsonLd = [], image, noindex = false, origin = SITE.origin }) {
  const url = origin + path;
  const rawImg = image || SITE.ogImage;
  const img = /^https?:\/\//.test(rawImg) ? rawImg : origin + rawImg;
  const desc = clampDesc(description);

  const ld = jsonLd.filter(Boolean).map(
    (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`
  ).join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
${noindex ? '<meta name="robots" content="noindex, follow" />' : '<meta name="robots" content="index, follow, max-image-preview:large" />'}
<link rel="canonical" href="${esc(url)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${esc(SITE.name)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${esc(url)}" />
<meta property="og:image" content="${esc(img)}" />
<meta property="og:locale" content="ko_KR" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="theme-color" content="#0c0c0f" />
<link rel="icon" href="/assets/favicon.png" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css">
<link rel="stylesheet" href="/assets/style.css">
${ld}
</head>
<body>

<header>
  <div class="wrap nav">
    <a class="logo" href="/"><img src="/assets/logo-dark.png" alt="${esc(SITE.name)}"></a>
    <nav class="nav-menu">
      ${NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join("\n      ")}
      <a href="${SITE.blog}" target="_blank" rel="noopener">블로그</a>
    </nav>
    <a class="btn btn-gold" href="tel:${SITE.tel}">전화상담</a>
  </div>
</header>

${body}

<footer>
  <div class="wrap">
    <div class="frow"><img src="/assets/logo-dark.png" alt="${esc(SITE.name)}" style="height:28px"></div>
    <div class="frow fmenu">
      ${NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join("\n      ")}
      <a href="${SITE.blog}" target="_blank" rel="noopener">블로그</a>
    </div>
    <div class="biz">
      <b>회사명</b> ${esc(SITE.legalName)} &nbsp;|&nbsp; <b>대표자</b> ${esc(SITE.ceo)} &nbsp;|&nbsp; <b>사업자등록번호</b> ${SITE.bizNo}<br>
      <b>주소</b> ${esc(SITE.address.city)} ${esc(SITE.address.street)} &nbsp;|&nbsp; <b>연락처</b> ${SITE.tel} / ${SITE.tel2}<br>
      <b>이메일</b> ${esc(SITE.email)}
    </div>
    <div style="color:#5a5a63">© 2026 ${esc(SITE.legalName)}. 부동산 경매 매물정보 · 경매 교육.</div>
  </div>
</footer>

<script defer src="/assets/track.js"></script>
</body>
</html>`;
}

/* ── 구조화 데이터(JSON-LD) ─────────────────────────────
 * 구글이 "이 사이트는 대구에 있는 부동산 경매 교육 사업체"라고 이해하게 해주는 부분. */

export function organizationLd(origin = SITE.origin) {
  return {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "EducationalOrganization"],
    "@id": origin + "/#organization",
    name: SITE.name,
    legalName: SITE.legalName,
    url: origin + "/",
    logo: origin + "/assets/logo-dark.png",
    image: origin + SITE.ogImage,
    telephone: SITE.tel,
    email: SITE.email,
    founder: { "@type": "Person", name: SITE.ceo },
    address: {
      "@type": "PostalAddress",
      streetAddress: SITE.address.street,
      addressLocality: SITE.address.city,
      addressCountry: SITE.address.country,
    },
    areaServed: { "@type": "AdministrativeArea", name: "대한민국" },
    knowsAbout: ["부동산 경매", "아파트 경매", "권리분석", "경매 교육"],
    sameAs: [SITE.blog, SITE.klass],
  };
}

export function breadcrumbLd(items, origin = SITE.origin) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: origin + it.path,
    })),
  };
}

export function itemListLd(items, origin = SITE.origin) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: origin + "/property/" + encodeURIComponent(p.id),
      name: p.title,
    })),
  };
}

export function html(bodyHtml, status = 200, extraHeaders = {}) {
  return new Response(bodyHtml, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=900",
      ...extraHeaders,
    },
  });
}
