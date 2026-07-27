const BLOG_ID = "ykphone_edu";
const RSS_URL = `https://rss.blog.naver.com/${BLOG_ID}.xml`;
const AUCTION_KEYWORDS = ["경매", "낙찰", "감정가", "최저가", "물건", "입찰"];
const UA = "Mozilla/5.0 (compatible; PropertyListBot/1.0)";

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
// 네이버 블로그 이미지는 postfiles/blogfiles/mblogthumb-phinf 같은 pstatic.net 계열 CDN에서 나온다.
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

// "3억 1,000만원" / "2억 1,700만원" / "310,000,000원" 형태를 그대로 문자열로 뽑아온다.
const KOREAN_WON = "[0-9][0-9,]*\\s*억?\\s*[0-9,]*\\s*만?\\s*원";

function extractAddress(plain) {
  const m = plain.match(/물건은\s*([^.]{2,40}?위치한[^.]{2,40}?)(?:입니다|이며)/);
  if (m) return m[1].replace(/위치한/, "").trim();
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

function guessRegionCategory(hashtags) {
  const region = hashtags.find((t) => /(대구|북구|수성구|달서구|중구|동구|서구|남구)/.test(t)) || "대구";
  const category = hashtags.find((t) => /(아파트|상가|주택|오피스텔|모텔|토지)/.test(t) && t.includes("경매")) || "경매매물";
  return { region, category };
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
  const idMatch = link.match(/(\d+)\/?$/);

  // RSS 요약은 대체로 글 도입부만 잘려있어 가격/주소 문장, 본문 사진들이 다 안 들어있는 경우가 많다.
  // 있으면 그대로 쓰고, 부족하면 원문 페이지를 한 번 더 가져와 본다(사진도 이때 전부 모은다).
  let plain = rssPlain;
  let images = extractImages(descriptionHtml);
  let address = extractAddress(plain);
  let appraisal = extractPrice(plain, "감정가(?:는|:|가)?\\s*");
  let minBid = extractPrice(plain, "최저(?:매각)?가(?:는|:)?\\s*(?:\\([0-9]+%\\)\\s*)?");

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
  const { region, category } = guessRegionCategory(hashtags);

  return {
    id: idMatch ? idMatch[1] : link,
    title,
    link,
    pubDate,
    thumbnail: images[0] || "",
    images,
    region,
    category,
    address,
    appraisal,
    minBid,
    hashtags,
    summary: rssPlain.slice(0, 90),
  };
}

function isAuctionPost(title, plain) {
  const combined = title + " " + plain;
  return AUCTION_KEYWORDS.some((k) => combined.includes(k));
}

export async function onRequestGet(context) {
  try {
    const res = await fetch(RSS_URL, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
    const xml = await res.text();

    const candidates = parseRssItems(xml).filter((itemXml) => {
      const title = tag(itemXml, "title");
      const plain = extractPlainText(tag(itemXml, "description"));
      return isAuctionPost(title, plain);
    });

    const items = await Promise.all(candidates.map(toProperty));

    return new Response(JSON.stringify({ source: "rss", items }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=600",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ source: "error", error: String(err), items: [] }),
      { status: 502, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }
}
