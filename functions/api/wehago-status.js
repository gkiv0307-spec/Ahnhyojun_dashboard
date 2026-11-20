/* GET /api/wehago-status?key=... — 위하고 수신결재 처리 현황 (wehago.html 용)
 *
 * 금액·받는사람이 들어 있으므로 DASHBOARD_KEY 가 설정되지 않으면 데이터를 내주지 않는다.
 * Pages 환경변수:
 *   DASHBOARD_KEY        대시보드 접근 키 (유입 분석 대시보드와 같은 값)
 *   WEHAGO_WEBAPP_URL    Apps Script 웹앱 주소(/exec)
 *   WEHAGO_SYNC_TOKEN    Apps Script 스크립트 속성 SYNC_TOKEN 과 같은 값 (브라우저로 나가지 않음)
 */

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function onRequestGet({ request, env }) {
  const requiredKey = env.DASHBOARD_KEY || "";
  if (!requiredKey) {
    return json({ error: "locked", message: "DASHBOARD_KEY 가 설정되지 않아 수신결재 현황을 보여줄 수 없습니다. 금액·받는사람이 들어 있어 접근 키가 꼭 필요합니다." }, 403);
  }
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== requiredKey) {
    return json({ error: "unauthorized", message: "대시보드 접근 키가 필요합니다." }, 401);
  }
  if (!env.WEHAGO_WEBAPP_URL || !env.WEHAGO_SYNC_TOKEN) {
    return json({ configured: false, message: "WEHAGO_WEBAPP_URL / WEHAGO_SYNC_TOKEN 환경변수가 없습니다." });
  }

  try {
    const res = await fetch(env.WEHAGO_WEBAPP_URL, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: env.WEHAGO_SYNC_TOKEN, action: "status" }),
      redirect: "follow",
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { return json({ error: "bad_upstream", message: `Apps Script 응답을 읽지 못했습니다 (HTTP ${res.status}).` }, 502); }
    if (!data.ok) return json({ error: "upstream", message: `Apps Script 오류: ${data.error}` }, 502);
    return json({ configured: true, ...data });
  } catch (e) {
    return json({ error: "fetch_failed", message: `Apps Script 에 연결하지 못했습니다: ${e.message}` }, 502);
  }
}
