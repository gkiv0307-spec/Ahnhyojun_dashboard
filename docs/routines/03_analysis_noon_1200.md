# 권리분석 체크 낮 회차 (매일 12시 KST) — cron `0 3 * * *`

[루틴] 권리분석 체크 낮 회차 — 매일 12:00 KST. 20시 루틴의 권리분석 체크·발행 확인 부분만 한 번 더 돌린다(GPT 최종본 반입·backfill 은 하지 않는다). 대리님이 오전에 올린 권리분석 글이 저녁까지 미작성으로 남지 않게 하려는 것(2026-09-23 대리님 지시). CLAUDE.md §2·§6 규칙을 따른다.

절차:
1. Drive 백업 폴더(1ZkIT6DPRGBg8DYu9ezNTEjo6ekUJMvZ4)에서 `title = 'ahj_dashboard_snapshot.json.gz'` 로 검색해 modifiedTime 최신 1건을 내려받는다(첫 두 바이트 1f 8b 면 gzip). 평문 `ahj_dashboard_snapshot.json` 이 더 최신이면 그것을 쓴다. `title contains` 로 찾지 않는다.
2. `python3 scripts/blog_rss_fetch.py naver_results.json` 으로 우리 블로그 3곳(ykphone_edu·hjko0·gkgk0307_) 글을 받는다. 전부 실패하면 routineRuns 에 fail 로 남기고 끝낸다.
3. `python3 scripts/market_analysis_check.py <snapshot> naver_results.json analysis_chunk.json` — 사건번호가 정확히 같은 카드만 `analysisWritten` 을 켠다. 켜기만 하고 끄지 않는다. 결과가 1건 이상이면 `ahj_patch_chunk_<UTC날짜>_analysis_noon.json` 으로 백업 폴더에 올린다. 0건이면 올리지 않는다.
4. `python3 scripts/blog_publish_match.py <snapshot> naver_results.json verify_chunk.json backfill_chunk.json` — verify 결과(대시보드 글의 url 채우기)만 `ahj_blog_chunk_<UTC날짜>-verify-noon.json` 으로 올린다. backfill 파일은 올리지 않는다(아침 몫). 같은 주소가 blogrss- 사본으로 이미 있으면 그 삭제 패치만 `ahj_patch_chunk_<UTC날짜>_blogdedupe_noon.json` 으로 올린다.
5. `ahj_patch_chunk_<UTC날짜>_routine_noon.json` 으로 routineRuns 에 기록: `[{op:"push", list:"routineRuns", fields:{id:"rr-<UTC날짜>-analysisCheck-noon", job:"analysisCheck", at:"<ISO UTC>", status:"ok|fail", summary:"낮 회차 · 권리분석 체크 N건 · 발행 확인 N건 · 글 없는 미작성 N건", detail:"…"}}]`. 0건 처리도 ok 다.
6. 올린 파일마다 Drive 에서 존재를 확인하고, 대리님께 파일명과 켜진 사건번호를 한두 줄로 보고한다. 켜진 게 없으면 "낮 회차: 새로 켤 글 없음(최신 글 M/D)" 한 줄만. 학생 이름·연락처·매출 같은 민감정보는 적지 않는다. 저장소 커밋은 하지 않는다.
