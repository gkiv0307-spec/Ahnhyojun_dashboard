/* GET /api/properties — 매물 목록 JSON (메인 페이지에서 호출)
 * 실제 파싱 로직은 functions/_lib/properties.js 로 옮겼다.
 * 서버 렌더 페이지(/property/{id}, /area/{지역})와 같은 데이터·같은 캐시를 쓴다. */
import { getProperties } from "../_lib/properties.js";

export async function onRequestGet(context) {
  try {
    const items = await getProperties(context);
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
