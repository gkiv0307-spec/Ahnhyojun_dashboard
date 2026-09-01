/* 네이버 블로그 RSS → 경매 매물 목록
 *
 * 원래 functions/api/properties.js 에 있던 파싱 로직을 옮겨온 것이다.
 * 매물 상세(/property/{id})·지역 페이지(/area/{지역})도 같은 데이터를 쓰기 때문에
 * 한 곳에 모으고, 매 요청마다 네이버를 다시 긁지 않도록 캐시를 붙였다.
 */

const BLOG_ID = "ykphone_edu";
const RSS_URL = `https://rss.blog.naver.com/${BLOG_ID}.xml`;
const AUCTION_KEYWORDS = ["경매", "낙찰", "감정가", "최저가", "물건", "입찰"];
const UA = "Mozilla/5.0 (compatible; PropertyListBot/1.0)";
// 파싱 규칙을 바꾸면 이 번호를 올린다. 그래야 엣지 캐시에 남아 있던 예전 결과가 버려지고
// 새 코드로 다시 분석한다. (안 올리면 배포해도 최대 15분간 예전 데이터가 그대로 나온다.)
const PARSER_VERSION = 2;
const CACHE_KEY = `https://cache.internal/properties-v${PARSER_VERSION}`;
const CACHE_TTL = 900; // 15분

function decodeEntities(str) {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripCdata(str) {
  const m = str.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1] : str;
}

function tag(itemXml, name) {
  const m = itemXml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  if (!m) return "";
  return decodeEntities(stripCdata(m[1])).trim();
}

function extractPlainText(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const IMG_EXCLUDE = /(ico_|btn_|sticker|emoticon|profile|blank\.gif|badge)/i;

// 블로그 본문(또는 RSS 요약) HTML에서 실제 사진으로 보이는 <img> 주소를 전부 모은다.
function extractImages(html, max = 15) {
  const urls = [];
  const re = /<img[^>]+src=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) {
    let src = decodeEntities(m[1]);
    if (!/pstatic\.net/.test(src)) continue;
    if (IMG_EXCLUDE.test(src)) continue;
    if (src.startsWith("//")) src = "https:" + src;
    if (!urls.includes(src)) urls.push(src);
    if (urls.length >= max) break;
  }
  return urls;
}

function parseRssItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) items.push(m[1]);
  return items;
}

const KOREAN_WON = "[0-9][0-9,]*\\s*억?\\s*[0-9,]*\\s*만?\\s*원";

const SIDO_NAMES = "서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주";

function extractAddress(plain) {
  const m = plain.match(/물건은\s*([^.]{2,40}?위치한[^.]{2,40}?)(?:입니다|이며)/);
  if (m) return m[1].replace(/위치한/, "").replace(/\s{2,}/g, " ").trim();

  // 위 문장이 없는 글이 많아, "시·도 + 구/군/시 + 동/읍/면" 형태를 본문에서 직접 찾아본다.
  const m2 = plain.match(
    new RegExp(`(${SIDO_NAMES})(?:광역시|특별시|특별자치시|특별자치도|도)?\\s*([가-힣]{1,8}(?:구|군|시))\\s*([가-힣]{1,8}(?:동|읍|면|리|가))`)
  );
  if (m2) return m2[0].replace(/\s{2,}/g, " ").trim();
  return "";
}

function extractPrice(plain, labelPattern) {
  const re = new RegExp(`${labelPattern}[^0-9]{0,10}(${KOREAN_WON})`);
  const m = plain.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function extractHashtags(plain) {
  const tags = plain.match(/#[가-힣0-9]+/g) || [];
  return [...new Set(tags.map((t) => t.slice(1)))];
}

/* ── 지역 분류 ────────────────────────────────────────
 * 지역별 페이지(/area/daegu 등)를 만들려면 글마다 "어느 시·도 물건인지"가 필요하다.
 * 1차로 광역시·도 이름을 찾고, 없으면 시·군 이름으로 되짚는다.
 * (예: "대구 읍내동 ... 칠곡이편한세상" 은 대구가 먼저 잡혀야 한다. 칠곡=경북으로 새면 안 됨) */
export const REGIONS = [
  { code: "seoul", name: "서울", full: "서울특별시", cities: ["강남", "송파", "노원", "은평", "관악"] },
  { code: "busan", name: "부산", full: "부산광역시", cities: ["해운대", "사하", "동래", "부산진"] },
  { code: "daegu", name: "대구", full: "대구광역시", cities: ["수성", "달서", "북구", "동구", "서구", "남구", "중구", "달성"] },
  { code: "incheon", name: "인천", full: "인천광역시", cities: ["부평", "계양", "연수", "서구"] },
  { code: "gwangju", name: "광주", full: "광주광역시", cities: ["북구", "광산"] },
  { code: "daejeon", name: "대전", full: "대전광역시", cities: ["유성", "서구", "대덕"] },
  { code: "ulsan", name: "울산", full: "울산광역시", cities: ["남구", "북구", "울주"] },
  { code: "sejong", name: "세종", full: "세종특별자치시", cities: [] },
  { code: "gyeonggi", name: "경기", full: "경기도", cities: ["수원", "성남", "용인", "고양", "안양", "부천", "안산", "평택", "화성", "남양주", "의정부", "파주", "김포", "광명", "군포", "시흥", "하남", "이천", "오산", "구리", "안성", "포천", "여주", "양주"] },
  { code: "gangwon", name: "강원", full: "강원특별자치도", cities: ["춘천", "원주", "강릉", "속초", "동해", "삼척", "태백"] },
  { code: "chungbuk", name: "충북", full: "충청북도", cities: ["청주", "충주", "제천", "음성", "진천"] },
  { code: "chungnam", name: "충남", full: "충청남도", cities: ["천안", "아산", "서산", "당진", "공주", "논산", "보령"] },
  { code: "jeonbuk", name: "전북", full: "전북특별자치도", cities: ["전주", "익산", "군산", "정읍", "남원"] },
  { code: "jeonnam", name: "전남", full: "전라남도", cities: ["여수", "순천", "목포", "광양", "나주"] },
  { code: "gyeongbuk", name: "경북", full: "경상북도", cities: ["포항", "구미", "경주", "경산", "안동", "김천", "칠곡", "영천", "상주", "문경", "영주"] },
  { code: "gyeongnam", name: "경남", full: "경상남도", cities: ["창원", "김해", "진주", "양산", "거제", "통영", "사천", "밀양"] },
  { code: "jeju", name: "제주", full: "제주특별자치도", cities: ["서귀포"] },
];

const REGION_BY_CODE = new Map(REGIONS.map((r) => [r.code, r]));
export const regionByCode = (code) => REGION_BY_CODE.get(String(code || "").toLowerCase()) || null;

const ALIASES = { 전라북도: "jeonbuk", 전라남도: "jeonnam", 경상북도: "gyeongbuk", 경상남도: "gyeongnam", 충청북도: "chungbuk", 충청남도: "chungnam" };

function detectRegion(text) {
  // 1차: 광역시·도 이름
  for (const r of REGIONS) {
    if (text.includes(r.name) || text.includes(r.full)) return r;
  }
  for (const [alias, code] of Object.entries(ALIASES)) {
    if (text.includes(alias)) return REGION_BY_CODE.get(code);
  }
  // 2차: 시·군 이름
  for (const r of REGIONS) {
    for (const c of r.cities) {
      if (text.includes(c)) return r;
    }
  }
  return null;
}

// "대구 북구" 처럼 한 단계 아래 행정구역까지 보여주기 위한 보조 추출(없으면 빈 문자열).
function detectSubRegion(text, region) {
  if (!region) return "";
  const m = text.match(/([가-힣]{2,4}(?:구|군|시))(?![도])/g);
  if (!m) return "";
  const hit = m.find((x) => x !== region.name && x !== region.full && !/광역시|특별시|특별자치/.test(x));
  return hit || "";
}

function guessCategory(hashtags, title) {
  const all = hashtags.join(" ") + " " + title;
  const kinds = ["아파트", "오피스텔", "빌라", "상가", "주택", "토지", "모텔", "공장", "다가구"];
  const found = kinds.find((k) => all.includes(k));
  return found ? found + " 경매" : "경매매물";
}

async function fetchFullPost(link) {
  try {
    const m = link.match(/blogId=([^&]+)&logNo=(\d+)|blog\.naver\.com\/([^/]+)\/(\d+)/);
    let blogId, logNo;
    if (m) {
      blogId = m[1] || m[3];
      logNo = m[2] || m[4];
    }
    if (!blogId || !logNo) return null;

    const mobileUrl = `https://m.blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`;
    const res = await fetch(mobileUrl, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const html = await res.text();
    return { html, plain: extractPlainText(html) };
  } catch {
    return null;
  }
}

async function toProperty(itemXml) {
  const title = tag(itemXml, "title");
  const link = tag(itemXml, "link");
  const pubDate = tag(itemXml, "pubDate");
  const descriptionHtml = tag(itemXml, "description");
  const rssPlain = extractPlainText(descriptionHtml);
  // RSS 링크는 "…/224397355155?fromRss=true&trackingCode=rss" 형태라 물음표 뒤를 잘라내야
  // 글번호가 잡힌다. 이 값이 그대로 /property/{글번호} 주소가 된다.
  const idMatch = link.split(/[?#]/)[0].match(/(\d+)\/?$/);

  let plain = rssPlain;
  let images = extractImages(descriptionHtml);
  let address = extractAddress(plain);
  let appraisal = extractPrice(plain, "감정가(?:는|:|가)?\\s*");
  let minBid = extractPrice(plain, "최저(?:매각)?가(?:는|:)?\\s*(?:\\([0-9]+%\\)\\s*)?");

  // RSS 요약은 글 도입부만 잘려 오는 경우가 많아, 부족하면 원문을 한 번 더 가져온다.
  if (!address || !appraisal || !minBid || images.length < 2) {
    const full = await fetchFullPost(link);
    if (full) {
      plain = full.plain;
      address = address || extractAddress(full.plain);
      appraisal = appraisal || extractPrice(full.plain, "감정가(?:는|:|가)?\\s*");
      minBid = minBid || extractPrice(full.plain, "최저(?:매각)?가(?:는|:)?\\s*(?:\\([0-9]+%\\)\\s*)?");
      const fullImages = extractImages(full.html);
      if (fullImages.length > images.length) images = fullImages;
    }
  }

  const hashtags = extractHashtags(plain);
  // 주소에 시·도가 적혀 있으면 그게 정답이다. 해시태그에는 홍보용으로 "대구"가 늘 붙어 있어
  // (예: 경북 경산 물건에 #대구경매) 주소보다 먼저 보면 지역이 틀어진다.
  const region = detectRegion(address) || detectRegion([hashtags.join(" "), title].join(" "));
  const sub = detectSubRegion([address, title].join(" "), region);
  const category = guessCategory(hashtags, title);

  return {
    id: idMatch ? idMatch[1] : link,
    title,
    link,
    pubDate,
    thumbnail: images[0] || "",
    images,
    regionCode: region ? region.code : "",
    region: region ? region.name : "",
    regionFull: region ? region.full : "",
    subRegion: sub,
    category,
    address,
    appraisal,
    minBid,
    hashtags,
    summary: rssPlain.slice(0, 120),
  };
}

function isAuctionPost(title, plain) {
  const combined = title + " " + plain;
  return AUCTION_KEYWORDS.some((k) => combined.includes(k));
}

async function fetchProperties() {
  const res = await fetch(RSS_URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
  const xml = await res.text();

  const candidates = parseRssItems(xml).filter((itemXml) => {
    const title = tag(itemXml, "title");
    const plain = extractPlainText(tag(itemXml, "description"));
    return isAuctionPost(title, plain);
  });

  const parsed = await Promise.all(candidates.map(toProperty));

  // 경매 키워드만 들어간 일반 글(공부법·공지 등)은 매물이 아니다.
  // 해시태그 때문에 지역은 거의 항상 붙으므로, 지역이 아니라 "감정가·최저가·소재지" 중
  // 하나라도 실제로 잡힌 글만 매물로 본다.
  return parsed.filter((p) => p.appraisal || p.minBid || p.address);
}

/**
 * 매물 목록을 가져온다. Cloudflare 엣지 캐시에 15분간 담아두고,
 * 같은 페이지를 여러 명이 열어도 네이버를 한 번만 긁도록 한다.
 * 실패하면 예외를 던지므로 호출한 쪽에서 503으로 응답할 것.
 */
export async function getProperties(context) {
  const cache = caches.default;
  const cacheReq = new Request(CACHE_KEY);

  try {
    const hit = await cache.match(cacheReq);
    if (hit) return await hit.json();
  } catch {}

  const items = await fetchProperties();

  try {
    const store = new Response(JSON.stringify(items), {
      headers: { "content-type": "application/json", "cache-control": `max-age=${CACHE_TTL}` },
    });
    if (context && context.waitUntil) context.waitUntil(cache.put(cacheReq, store));
    else await cache.put(cacheReq, store);
  } catch {}

  return items;
}

/** 지역별 매물 묶음. 매물이 많은 지역 순으로 돌려준다. */
export function groupByRegion(items) {
  const map = new Map();
  for (const p of items) {
    if (!p.regionCode) continue;
    if (!map.has(p.regionCode)) map.set(p.regionCode, []);
    map.get(p.regionCode).push(p);
  }
  return [...map.entries()]
    .map(([code, list]) => ({ region: regionByCode(code), items: list }))
    .filter((g) => g.region)
    .sort((a, b) => b.items.length - a.items.length);
}

/** 지역 페이지를 공개할 최소 매물 수 — 내용 없는 페이지를 검색엔진에 노출하지 않기 위한 기준. */
export const MIN_PROPERTIES_PER_REGION = 3;
