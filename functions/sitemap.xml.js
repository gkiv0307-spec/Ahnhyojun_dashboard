/* GET /sitemap.xml — 검색엔진에 "이 사이트에 어떤 페이지가 있는지" 알려주는 목록.
 * 매물이 늘어나면 자동으로 반영되도록 서버에서 그때그때 만든다. */
import { originOf } from "./_lib/site.js";
import { getProperties, groupByRegion, MIN_PROPERTIES_PER_REGION } from "./_lib/properties.js";

const STATIC_PAGES = [
  { path: "/", priority: "1.0", freq: "daily" },
  { path: "/area", priority: "0.9", freq: "daily" },
  { path: "/courses.html", priority: "0.9", freq: "weekly" },
  { path: "/about.html", priority: "0.7", freq: "monthly" },
  { path: "/reviews.html", priority: "0.7", freq: "monthly" },
];

function iso(d) {
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

function urlEntry(loc, { lastmod, freq, priority } = {}) {
  return `  <url>
    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}${freq ? `\n    <changefreq>${freq}</changefreq>` : ""}${priority ? `\n    <priority>${priority}</priority>` : ""}
  </url>`;
}

export async function onRequestGet(context) {
  const origin = originOf(context.request);
  const today = new Date().toISOString().slice(0, 10);

  let items = [];
  try {
    items = await getProperties(context);
  } catch {
    // 매물을 못 불러와도 고정 페이지만이라도 알려준다.
  }

  const urls = STATIC_PAGES.map((p) =>
    urlEntry(origin + p.path, { lastmod: today, freq: p.freq, priority: p.priority })
  );

  for (const g of groupByRegion(items)) {
    if (g.items.length < MIN_PROPERTIES_PER_REGION) continue;
    const newest = g.items.map((p) => iso(p.pubDate)).filter(Boolean).sort().pop();
    urls.push(urlEntry(`${origin}/area/${g.region.code}`, { lastmod: newest || today, freq: "daily", priority: "0.9" }));
  }

  for (const p of items) {
    urls.push(
      urlEntry(`${origin}/property/${encodeURIComponent(p.id)}`, {
        lastmod: iso(p.pubDate) || today,
        freq: "weekly",
        priority: "0.8",
      })
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=600, s-maxage=1800",
    },
  });
}
