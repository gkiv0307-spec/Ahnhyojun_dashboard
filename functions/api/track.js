/* POST /api/track — 방문 이벤트 수집
 *
 * 저장소: Cloudflare D1 (Pages 프로젝트에 변수명 `DB`로 바인딩)
 * 바인딩이 없으면 아무것도 저장하지 않고 조용히 202를 돌려준다(사이트 동작에 영향 없음).
 * IP는 저장하지 않는다. 국가/시도 단위 위치만 Cloudflare가 넘겨주는 값으로 기록한다.
 */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL, day TEXT NOT NULL, hour INTEGER NOT NULL,
    type TEXT NOT NULL, session_id TEXT NOT NULL, visitor_id TEXT,
    seq INTEGER, is_new INTEGER, path TEXT, title TEXT, label TEXT,
    landing_path TEXT, referrer TEXT, ref_domain TEXT, channel TEXT,
    source TEXT, medium TEXT, campaign TEXT, term TEXT, content TEXT,
    device TEXT, os TEXT, browser TEXT, country TEXT, region TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_day ON events(day)`,
  `CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, seq)`,
  `CREATE INDEX IF NOT EXISTS idx_events_channel ON events(day, channel)`,
];

const BOT_RE = /(bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|curl|wget|python-requests|headless|lighthouse|pingdom|uptime|gtmetrix|yeti|daumoa)/i;

// KST(UTC+9) 기준 날짜/시간 — 사이트 방문자가 전부 국내라 KST로 집계한다.
function kst(ts) {
  const d = new Date(ts + 9 * 3600 * 1000);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

/* 유입 채널 분류 — 국내 트래픽 기준.
 * 네이버 검색/블로그/카페, 카카오톡, 다음, 구글, SNS를 각각 따로 본다. */
function classify(refDomain, refUrl, ua, utm) {
  if (utm.source || utm.medium || utm.campaign) {
    const m = (utm.medium || "").toLowerCase();
    let ch = "캠페인(UTM)";
    if (/cpc|ppc|paid|ad|ads|display/.test(m)) ch = "유료광고";
    else if (/email|mail|edm/.test(m)) ch = "이메일";
    else if (/sms|talk|message|kakao/.test(m)) ch = "문자·알림톡";
    else if (/social|sns/.test(m)) ch = "소셜";
    return { channel: ch, source: utm.source || refDomain || "(직접)", medium: utm.medium || "campaign" };
  }

  const d = refDomain;
  const u = (refUrl || "").toLowerCase();

  const rules = [
    [/^(m\.)?search\.naver\.com|^search\.naver|^ade\.naver/, "네이버 검색", "organic"],
    [/blog\.naver\.com|^blog\.me|blogpfthumb|^m\.blog\.naver/, "네이버 블로그", "referral"],
    [/cafe\.naver\.com/, "네이버 카페", "referral"],
    [/^(m\.|in\.|post\.|tv\.|shopping\.|map\.|nid\.)?naver\.(com|me)$|^naver\.me$/, "네이버 기타", "referral"],
    [/^(www\.)?google\.|^google\./, "구글 검색", "organic"],
    [/search\.daum\.net|^m\.search\.daum/, "다음 검색", "organic"],
    [/cafe\.daum\.net/, "다음 카페", "referral"],
    [/daum\.net|^kakao\.com$/, "다음·카카오 기타", "referral"],
    [/kakao|katalk|^talk\./, "카카오톡", "referral"],
    [/bing\.com|search\.yahoo|zum\.com|duckduckgo|nate\.com/, "기타 검색", "organic"],
    [/instagram\.com|^l\.instagram/, "인스타그램", "social"],
    [/facebook\.com|^l\.facebook|^lm\.facebook|^fb\./, "페이스북", "social"],
    [/youtube\.com|youtu\.be/, "유튜브", "social"],
    [/threads\.net/, "스레드", "social"],
    [/twitter\.com|^t\.co$|^x\.com$/, "X(트위터)", "social"],
    [/band\.us/, "밴드", "social"],
    [/liveklass\.com/, "라이브클래스(강의)", "referral"],
    [/imweb\.me|gkinvestmnet|gkinvestment/, "기존 홈페이지", "referral"],
  ];

  if (d) {
    for (const [re, ch, med] of rules) {
      if (re.test(d) || re.test(u)) return { channel: ch, source: d, medium: med };
    }
    return { channel: "기타 사이트", source: d, medium: "referral" };
  }

  // referrer가 비어 있는 경우 — 앱 내부 브라우저는 UA로 어느 앱인지 알 수 있다.
  if (/kakaotalk/i.test(ua)) return { channel: "카카오톡", source: "kakaotalk(앱)", medium: "app" };
  if (/instagram/i.test(ua)) return { channel: "인스타그램", source: "instagram(앱)", medium: "app" };
  if (/naver\(inapp|naver ?app/i.test(ua)) return { channel: "네이버 앱", source: "naver(앱)", medium: "app" };
  if (/fb_iab|fban|fbav/i.test(ua)) return { channel: "페이스북", source: "facebook(앱)", medium: "app" };
  if (/daumapps|daum\//i.test(ua)) return { channel: "다음·카카오 기타", source: "daum(앱)", medium: "app" };
  if (/band\//i.test(ua)) return { channel: "밴드", source: "band(앱)", medium: "app" };

  return { channel: "직접 유입", source: "(직접)", medium: "direct" };
}

function parseUa(ua, screenWidth) {
  const isTablet = /ipad|tablet|sm-t|nexus (7|9|10)/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua));
  const isMobile = /iphone|ipod|android|windows phone|mobile/i.test(ua);
  let device = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";
  if (!ua && screenWidth) device = screenWidth < 768 ? "mobile" : "desktop";

  let os = "기타";
  if (/iphone|ipad|ipod|ios/i.test(ua)) os = "iOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/windows/i.test(ua)) os = "Windows";
  else if (/mac os x|macintosh/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua)) os = "Linux";

  let browser = "기타";
  if (/kakaotalk/i.test(ua)) browser = "카카오톡 인앱";
  else if (/naver\(inapp|naver ?app/i.test(ua)) browser = "네이버 앱";
  else if (/instagram/i.test(ua)) browser = "인스타그램 인앱";
  else if (/whale/i.test(ua)) browser = "웨일";
  else if (/samsungbrowser/i.test(ua)) browser = "삼성인터넷";
  else if (/edg\//i.test(ua)) browser = "Edge";
  else if (/firefox/i.test(ua)) browser = "Firefox";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/safari/i.test(ua)) browser = "Safari";

  return { device, os, browser };
}

function cleanPath(p) {
  if (!p) return "/";
  // UTM 등 추적 파라미터는 경로 통계에서 제거해 같은 페이지로 묶는다.
  try {
    const url = new URL(p, "https://x.local");
    [...url.searchParams.keys()].forEach((k) => { if (/^utm_|^fbclid$|^gclid$/i.test(k)) url.searchParams.delete(k); });
    // "/" 와 "/index.html" 은 같은 페이지이므로 통계에서 한 줄로 묶는다.
    const pathname = url.pathname.replace(/\/index\.html$/, "/");
    return (pathname + (url.search || "")).slice(0, 200);
  } catch {
    return String(p).slice(0, 200);
  }
}

async function ensureSchema(db) {
  for (const sql of SCHEMA) await db.prepare(sql).run();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); } catch { return new Response(null, { status: 204 }); }
  if (!body || !body.sid) return new Response(null, { status: 204 });

  const ua = request.headers.get("user-agent") || "";
  if (BOT_RE.test(ua)) return new Response(null, { status: 204 }); // 봇/크롤러 제외

  if (!env.DB) {
    return new Response(JSON.stringify({ stored: false, reason: "D1 바인딩(DB) 없음" }), {
      status: 202, headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const selfHost = hostOf(request.url);
  const utm = body.utm || {};
  const rawRef = String(body.ref || "").slice(0, 500);
  let refDomain = hostOf(rawRef);
  if (refDomain && selfHost && refDomain === selfHost.replace(/^www\./, "")) refDomain = ""; // 내부 이동은 유입 아님

  const { channel, source, medium } = classify(refDomain, rawRef, ua, {
    source: (utm.source || "").slice(0, 120),
    medium: (utm.medium || "").slice(0, 120),
    campaign: (utm.campaign || "").slice(0, 120),
  });
  const { device, os, browser } = parseUa(ua, Number(body.sw) || 0);

  const ts = Date.now();
  const { day, hour } = kst(ts);
  const cf = request.cf || {};

  const values = [
    ts, day, hour,
    body.type === "click" ? "click" : "pageview",
    String(body.sid).slice(0, 40),
    String(body.vid || "").slice(0, 40),
    Number(body.seq) || 1,
    body.isNew ? 1 : 0,
    cleanPath(body.path),
    String(body.title || "").slice(0, 160),
    String(body.label || "").slice(0, 80),
    cleanPath(body.landing),
    refDomain ? rawRef : "",
    refDomain,
    channel,
    source, medium,
    (utm.campaign || "").slice(0, 120),
    (utm.term || "").slice(0, 120),
    (utm.content || "").slice(0, 120),
    device, os, browser,
    cf.country || "", cf.region || "",
  ];

  const sql = `INSERT INTO events
    (ts, day, hour, type, session_id, visitor_id, seq, is_new, path, title, label,
     landing_path, referrer, ref_domain, channel, source, medium, campaign, term, content,
     device, os, browser, country, region)
    VALUES (${values.map(() => "?").join(",")})`;

  try {
    await env.DB.prepare(sql).bind(...values).run();
  } catch (err) {
    // 첫 요청이면 테이블이 아직 없다 → 스키마를 만들고 한 번만 재시도
    if (/no such table/i.test(String(err))) {
      try {
        await ensureSchema(env.DB);
        await env.DB.prepare(sql).bind(...values).run();
      } catch (e2) {
        return new Response(JSON.stringify({ stored: false, error: String(e2) }), { status: 202 });
      }
    } else {
      return new Response(JSON.stringify({ stored: false, error: String(err) }), { status: 202 });
    }
  }

  // 보관 기간이 지난 데이터는 가끔씩 정리한다(기본 180일, RETENTION_DAYS로 조절).
  if (Math.random() < 0.005) {
    const keep = Number(env.RETENTION_DAYS || 180);
    const cutoff = kst(ts - keep * 86400000).day;
    try { await env.DB.prepare(`DELETE FROM events WHERE day < ?`).bind(cutoff).run(); } catch {}
  }

  return new Response(null, { status: 204 });
}
