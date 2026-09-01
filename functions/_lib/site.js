/* 사이트 공통 정보 + 서버 렌더 페이지의 HTML 골격
 *
 * 홈(index.html)과 같은 디자인을 쓰기 위해 헤더·푸터 마크업과 css/style.css 를 그대로 재사용하고,
 * 서버 렌더 페이지 전용 스타일만 assets/pages.css 로 얹는다.
 * (홈의 js/main.js 는 히어로 슬라이드·모바일 메뉴 등 랜딩 전용이라 여기서는 부르지 않는다.)
 *
 * functions/ 안에서 `_` 로 시작하는 폴더는 핸들러를 export 하지 않으므로 라우트로 잡히지 않는다.
 */

export const SITE = {
  name: "옆커폰부동산에듀",
  legalName: "주식회사 옆커폰부동산에듀",
  origin: "https://xn--289av8kwmfs4dv2e.store", // 부동산경매.store
  displayDomain: "부동산경매.store",
  ceo: "고호정",
  tel: "053-281-0759",
  telHref: "0532810759",
  mobile: "010-6419-0759",
  address: { street: "수성구 두산동 207-5, 2층 204호", city: "대구광역시", country: "KR" },
  blog: "https://blog.naver.com/ykphone_edu",
  cafe: "https://cafe.naver.com/kkkiiimmm",
  instagram: "https://www.instagram.com/ykphone_edu/",
  klass: "https://gkinvestment.liveklass.com/classes/253735",
  logo: "/assets/ykphone-logo-horizontal.png",
  ogImage: "/assets/og-cover.png",
  naverVerification: "368b5d60cbecc94652dbf0e533bcdf36e3e176ac",
  ga4: "G-TF6QHZ61PZ",
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

function header() {
  return `<header class="site-header">
  <a class="brand" href="/" aria-label="${esc(SITE.name)} 홈"><img src="${SITE.logo}" alt="${esc(SITE.name)}"></a>
  <nav aria-label="주요 메뉴">
    <a href="/#properties">전국 물건</a>
    <a href="/area">지역별 물건</a>
    <a href="${SITE.klass}" target="_blank" rel="noreferrer">온라인 강의</a>
    <a href="${SITE.blog}" target="_blank" rel="noreferrer">블로그</a>
    <a href="/#about">대표소개</a>
    <a href="/#reviews">수강·낙찰후기</a>
  </nav>
  <div class="header-socials" aria-label="소셜 채널">
    <a href="${SITE.cafe}" target="_blank" rel="noreferrer" aria-label="네이버 카페"><b>N</b><span>카페</span></a>
    <a href="${SITE.instagram}" target="_blank" rel="noreferrer" aria-label="인스타그램"><b>◎</b><span>인스타그램</span></a>
  </div>
  <a class="header-call" href="tel:${SITE.telHref}"><span>전화상담</span>${SITE.tel}</a>
</header>`;
}

function footer() {
  return `<footer>
  <div class="footer-brand">
    <img src="${SITE.logo}" alt="${esc(SITE.name)}">
    <p>돈 되는 경매, 판단의 순서부터.</p>
  </div>
  <div>
    <p>대표 ${esc(SITE.ceo)} · ${esc(SITE.legalName)}</p>
    <p>${esc(SITE.address.city)} ${esc(SITE.address.street)}</p>
    <p>${SITE.tel} · ${SITE.mobile}</p>
  </div>
  <div class="footer-links">
    <a href="${SITE.klass}" target="_blank" rel="noreferrer">온라인 강의</a>
    <a href="${SITE.blog}" target="_blank" rel="noreferrer">블로그</a>
    <a href="${SITE.cafe}" target="_blank" rel="noreferrer">네이버 카페</a>
    <a href="${SITE.instagram}" target="_blank" rel="noreferrer">인스타그램</a>
    <a href="/#about">대표소개</a>
    <a href="/#reviews">수강·낙찰후기</a>
    <a href="/area">지역별 경매 물건</a>
    <a href="tel:${SITE.telHref}">상담전화</a>
  </div>
</footer>`;
}

/**
 * 서버에서 완성된 HTML을 만들어 준다.
 * 네이버 크롤러는 자바스크립트를 거의 실행하지 않으므로, 검색에 걸려야 하는 내용은
 * 반드시 이 함수를 통해 HTML 안에 글자로 들어가 있어야 한다.
 */
export function page({ title, description, path, body, jsonLd = [], image, noindex = false, origin = SITE.origin, keywords }) {
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
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${keywords ? `<meta name="keywords" content="${esc(keywords)}">` : ""}
${noindex ? '<meta name="robots" content="noindex, follow">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
<meta name="naver-site-verification" content="${SITE.naverVerification}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:locale" content="ko_KR">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0b0a09">
<link rel="icon" href="/assets/ykphone-logo-mark.png">
<link rel="stylesheet" href="/css/style.css">
<link rel="stylesheet" href="/assets/pages.css">
<script async src="https://www.googletagmanager.com/gtag/js?id=${SITE.ga4}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","${SITE.ga4}");</script>
${ld}
</head>
<body>
${header()}
<main class="pg-main">
${body}
</main>
${footer()}
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
    logo: origin + SITE.logo,
    image: origin + SITE.ogImage,
    telephone: SITE.tel,
    founder: { "@type": "Person", name: SITE.ceo },
    address: {
      "@type": "PostalAddress",
      streetAddress: SITE.address.street,
      addressLocality: SITE.address.city,
      addressCountry: SITE.address.country,
    },
    areaServed: { "@type": "AdministrativeArea", name: "대한민국" },
    knowsAbout: ["부동산 경매", "아파트 경매", "권리분석", "경매 교육"],
    sameAs: [SITE.blog, SITE.cafe, SITE.instagram, SITE.klass],
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
