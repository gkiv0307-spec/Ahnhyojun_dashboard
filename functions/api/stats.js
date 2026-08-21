/* GET /api/stats?days=7[&key=...] — 대시보드용 집계 결과(JSON)
 *
 * 인증: Pages 환경변수 DASHBOARD_KEY 를 설정해두면 같은 값을 key 파라미터로 보내야 한다.
 *       설정하지 않으면 누구나 조회 가능하며 응답에 unprotected:true 가 붙는다.
 */

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function kstDay(ts) {
  return new Date(ts + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function dayList(from, to) {
  const out = [];
  let d = new Date(from + "T00:00:00Z").getTime();
  const end = new Date(to + "T00:00:00Z").getTime();
  while (d <= end && out.length < 400) {
    out.push(new Date(d).toISOString().slice(0, 10));
    d += 86400000;
  }
  return out;
}

const rows = (r) => (r && r.results) || [];

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const requiredKey = env.DASHBOARD_KEY || "";
  if (requiredKey && url.searchParams.get("key") !== requiredKey) {
    return json({ error: "unauthorized", message: "대시보드 접근 키가 필요합니다." }, 401);
  }

  if (!env.DB) {
    return json({
      configured: false,
      message: "D1 데이터베이스(DB)가 연결되어 있지 않습니다. 분석-대시보드-설정.md 를 참고해 바인딩하세요.",
    });
  }

  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "7", 10) || 7, 1), 365);
  const now = Date.now();
  const to = url.searchParams.get("to") || kstDay(now);
  const from = url.searchParams.get("from") || kstDay(now - (days - 1) * 86400000);
  const P = [from, to];

  const pv = `type='pageview' AND day BETWEEN ? AND ?`;
  const entry = `type='pageview' AND seq=1 AND day BETWEEN ? AND ?`;

  const q = (sql) => env.DB.prepare(sql).bind(...P);

  let res;
  try {
    res = await env.DB.batch([
      q(`SELECT COUNT(*) pv, COUNT(DISTINCT session_id) sessions, COUNT(DISTINCT visitor_id) visitors FROM events WHERE ${pv}`),
      q(`SELECT COALESCE(SUM(is_new),0) news, COUNT(*) starts FROM events WHERE ${entry}`),
      q(`SELECT COUNT(*) bounces FROM (SELECT session_id FROM events WHERE ${pv} GROUP BY session_id HAVING MAX(seq)=1)`),
      q(`SELECT day, COUNT(*) pv, COUNT(DISTINCT session_id) sessions, COUNT(DISTINCT visitor_id) visitors FROM events WHERE ${pv} GROUP BY day ORDER BY day`),
      q(`SELECT channel name, COUNT(*) sessions FROM events WHERE ${entry} GROUP BY channel ORDER BY sessions DESC`),
      q(`SELECT ref_domain name, channel, COUNT(*) sessions FROM events WHERE ${entry} AND ref_domain<>'' GROUP BY ref_domain, channel ORDER BY sessions DESC LIMIT 15`),
      q(`SELECT landing_path name, COUNT(*) sessions FROM events WHERE ${entry} GROUP BY landing_path ORDER BY sessions DESC LIMIT 12`),
      q(`SELECT path name, COUNT(*) pv, COUNT(DISTINCT session_id) sessions FROM events WHERE ${pv} GROUP BY path ORDER BY pv DESC LIMIT 12`),
      q(`SELECT device name, COUNT(*) sessions FROM events WHERE ${entry} GROUP BY device ORDER BY sessions DESC`),
      q(`SELECT browser name, COUNT(*) sessions FROM events WHERE ${entry} GROUP BY browser ORDER BY sessions DESC LIMIT 8`),
      q(`SELECT hour, COUNT(*) sessions FROM events WHERE ${entry} GROUP BY hour ORDER BY hour`),
      q(`SELECT source, medium, campaign, COUNT(*) sessions FROM events WHERE ${entry} AND (campaign<>'' OR medium NOT IN ('direct','referral','organic','app')) GROUP BY source, medium, campaign ORDER BY sessions DESC LIMIT 12`),
      q(`SELECT channel, landing_path, COUNT(*) sessions FROM events WHERE ${entry} GROUP BY channel, landing_path ORDER BY sessions DESC LIMIT 15`),
      q(`SELECT label name, COUNT(*) clicks, COUNT(DISTINCT session_id) sessions FROM events WHERE type='click' AND day BETWEEN ? AND ? AND label<>'' GROUP BY label ORDER BY clicks DESC LIMIT 10`),
      q(`SELECT country, region, COUNT(*) sessions FROM events WHERE ${entry} GROUP BY country, region ORDER BY sessions DESC LIMIT 10`),
      q(`SELECT session_id, seq, path, channel FROM events WHERE ${pv} ORDER BY session_id, seq LIMIT 20000`),
    ]);
  } catch (err) {
    if (/no such table/i.test(String(err))) {
      return json({ configured: true, empty: true, message: "아직 수집된 방문 기록이 없습니다.", range: { from, to } });
    }
    return json({ error: "query_failed", message: String(err) }, 500);
  }

  const t = rows(res[0])[0] || { pv: 0, sessions: 0, visitors: 0 };
  const n = rows(res[1])[0] || { news: 0, starts: 0 };
  const b = rows(res[2])[0] || { bounces: 0 };

  // 일자별 — 방문이 없는 날도 0으로 채워 추이 그래프가 끊기지 않게 한다.
  const daily = new Map(rows(res[3]).map((r) => [r.day, r]));
  const trend = dayList(from, to).map((d) => {
    const r = daily.get(d) || {};
    return { day: d, pv: r.pv || 0, sessions: r.sessions || 0, visitors: r.visitors || 0 };
  });

  const hourMap = new Map(rows(res[10]).map((r) => [r.hour, r.sessions]));
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, sessions: hourMap.get(h) || 0 }));

  // 세션별 이동 경로 — "어디서 들어와 → 어느 페이지로 들어와 → 그다음 어디로" 를 묶는다.
  const seqRows = rows(res[15]);
  const bySession = new Map();
  for (const r of seqRows) {
    if (!bySession.has(r.session_id)) bySession.set(r.session_id, { channel: r.channel, steps: [] });
    const s = bySession.get(r.session_id);
    const last = s.steps[s.steps.length - 1];
    if (last !== r.path) s.steps.push(r.path); // 새로고침 등 같은 페이지 연속은 한 번으로
  }
  const journeyCount = new Map();
  for (const s of bySession.values()) {
    const steps = s.steps.slice(0, 4);
    const key = JSON.stringify([s.channel, steps, s.steps.length > 4]);
    journeyCount.set(key, (journeyCount.get(key) || 0) + 1);
  }
  const journeys = [...journeyCount.entries()]
    .map(([k, sessions]) => {
      const [channel, steps, more] = JSON.parse(k);
      return { channel, steps, more, sessions };
    })
    .sort((a, b2) => b2.sessions - a.sessions)
    .slice(0, 15);

  const sessions = t.sessions || 0;

  return json({
    configured: true,
    unprotected: !requiredKey,
    range: { from, to, days: trend.length },
    generatedAt: new Date().toISOString(),
    totals: {
      pageviews: t.pv || 0,
      sessions,
      visitors: t.visitors || 0,
      newVisitors: n.news || 0,
      pagesPerSession: sessions ? +((t.pv || 0) / sessions).toFixed(2) : 0,
      bounceRate: sessions ? +(((b.bounces || 0) / sessions) * 100).toFixed(1) : 0,
    },
    trend,
    channels: rows(res[4]),
    referrers: rows(res[5]),
    landings: rows(res[6]),
    pages: rows(res[7]),
    devices: rows(res[8]),
    browsers: rows(res[9]),
    hours,
    campaigns: rows(res[11]),
    channelLanding: rows(res[12]),
    clicks: rows(res[13]),
    regions: rows(res[14]),
    journeys,
    journeysTruncated: seqRows.length >= 20000,
  });
}
