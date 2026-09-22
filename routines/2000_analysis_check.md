매일 저녁 권리분석 체크 + 블로그 발행 확인 시간입니다 (job key `analysisCheck`, 담당: 운영 비서). 이 루틴은 RSS 를 한 번 받아 두 가지를 한다.

**지킬 것**
- 권리분석 체크는 **켜기만 한다. 이미 켜진 것을 끄지 않는다.** 대리님이 직접 끈 것을 되돌리면 안 된다.
- **사건번호가 정확히 같을 때만** 켠다. 단지명·제목이 비슷하다고 켜지 않는다.
- 스냅샷 전체를 수정·재업로드하지 않는다(작은 청크만).
- 업로드한 파일은 폴더에서 실제로 생겼는지 확인하고 답변에 파일명을 적는다.
- 도구가 "세션 만료"나 연결 오류로 실패하면 ToolSearch로 다시 로드해 최대 2번까지 재시도한다.

## 순서

1. Google Drive 폴더(parentId: 1ZkIT6DPRGBg8DYu9ezNTEjo6ekUJMvZ4)에서 스냅샷을 **정확한 제목으로** 검색한다: `(title = 'ahj_dashboard_snapshot.json.gz' or title = 'ahj_dashboard_snapshot.json') and parentId = '1ZkIT6DPRGBg8DYu9ezNTEjo6ekUJMvZ4'` → modifiedTime 이 가장 최근인 파일을 받는다. `title contains` 로 찾으면 안 된다 — 폴더에 `ahj_dashboard_snapshot_이전전보관_2026-09-11.json` 처럼 이름을 바꿔 둔 옛 파일이 있고, 이름을 바꾼 시각이 modifiedTime 이 되어 "최신"으로 잘못 잡힌다(2026-09-18 확인). 2026-09-16 부터 대시보드는 gzip 압축본(.json.gz, 정상 크기 150~400KB)으로 올린다 — 1MB 를 넘긴 평문 저장이 전부 실패했기 때문이다. base64 를 디코드한 바이트가 `1f 8b` 로 시작하면 `gzip.decompress` 로 풀어 평문 JSON 을 로컬 `snapshot.json` 으로 저장한다(Python: `import gzip,base64,json; raw=base64.b64decode(content); raw=gzip.decompress(raw) if raw[:2]==b'\x1f\x8b' else raw; open('snapshot.json','wb').write(raw)`). 평문 .json 이면 900KB 근처가 정상이고, 수십~수백 KB 짜리 평문은 빈 부분 스냅샷이니 쓰지 말고 그 다음 정상 파일을 쓴다. scripts/*.py 는 압축본을 그대로 넘겨도 읽는다. 스냅샷보다 나중에 올라온 `ahj_market_chunk_*.json` 이 있으면 받아서 marketAuctions 에 얹는다(사건번호+물건번호 기준 upsert) — 그 사이 현황판이 보낸 물건은 스냅샷에 없어서 안 얹으면 빠진다.

2. `python3 /home/user/yeopkerphone-auction-site/scripts/blog_rss_fetch.py naver_results.json`
   우리 블로그 3곳(ykphone_edu · hjko0 · gkgk0307_) RSS 와 모바일 글 목록을 받는다. 전부 실패하면(종료코드 1) 아래 D 에 `fail` 로 기록하고 끝낸다.

3. **권리분석 체크** — `python3 /home/user/yeopkerphone-auction-site/scripts/market_analysis_check.py snapshot.json naver_results.json analysis_chunk.json`
   - `analysis_chunk.json` 이 비어 있지 않으면 title `ahj_patch_chunk_YYYY-MM-DD_analysis.json`(KST 오늘 날짜, parentId 위와 같음, contentMimeType "application/json", disableConversionToGoogleType true)으로 업로드한다.
   - 비어 있으면 올리지 않는다(정상이다).
   - "글 없는 미작성" 물건은 건드리지 말고 답변에 목록만 적는다 — 대리님이 다음에 쓸 글 후보다.

4. **블로그 발행 확인** (아침 07시와 같은 것을 저녁에 한 번 더 — 대리님이 낮에 올린 글을 그날 저녁에 발행완료로 잡기 위해서다) — `python3 /home/user/yeopkerphone-auction-site/scripts/blog_publish_match.py snapshot.json naver_results.json verify_chunk.json backfill_chunk.json`
   - `verify_chunk.json` 이 비어 있지 않으면 `ahj_blog_chunk_YYYY-MM-DD-verify-evening.json` 으로 업로드한다(대시보드 글에 발행완료+주소 채우기. 사건번호 또는 제목 유사도로 맞춘 것).
   - `backfill_chunk.json` 은 **delete 항목(제목으로 맞춘 글과 겹치는 `blogrss-…` 사본 정리)만** 골라 `ahj_patch_chunk_YYYY-MM-DD_blogdedupe_evening.json` 으로 올린다. 새 글 등록(set/upsert)은 아침 루틴 몫이므로 저녁엔 올리지 않는다. 2026-08 이전 글 45건은 대리님이 "그냥 두기"로 정했다.

5. **GPT 최종본 반입** — 대리님이 GPT로 다듬어 Drive 폴더 "블로그 GPT 교환"(parentId `1FiETh0OJuly14r6GQ0tgh5nXp-Lkc_pd`)에 저장한 `<글id>_GPT최종.md`(또는 `.txt`, Google 문서)를 대시보드 본문에 반영한다.
   - `mcp__Google_Drive__search_files` query `parentId = '1FiETh0OJuly14r6GQ0tgh5nXp-Lkc_pd' and title contains '_GPT최종'` (excludeContentSnippets true). 없으면 이 단계는 "GPT 최종본 0건" 으로 끝낸다.
   - 파일마다 내려받아 로컬 `gpt_in/<파일제목>` 으로 저장한다(.md/.txt 는 `download_file_content` base64 디코드, Google 문서면 `read_file_content` 로 읽어 `<제목>.md` 로 저장하되 제목이 `_GPT최종` 으로 끝나면 `.md` 를 붙인다).
   - `python3 /home/user/yeopkerphone-auction-site/scripts/blog_gpt_import.py snapshot.json gpt_in gptfinal_chunk.json` — 스냅샷 body 와 같은 파일(이미 반영됨)·글id 불일치·발행대기가 아닌 글은 스크립트가 걸러 준다.
   - `gptfinal_chunk.json` 이 비어 있지 않으면 `ahj_patch_chunk_YYYY-MM-DD_blog_gptfinal.json`(parentId `1ZkIT6DPRGBg8DYu9ezNTEjo6ekUJMvZ4`, contentMimeType "application/json", disableConversionToGoogleType true)으로 올린다. 이 패치는 `blogPosts` 의 body·title 을 GPT 본으로 바꾸고 stageLog 에 "GPT최종" 단계를 남긴다(상태는 발행대기 그대로 — 게시는 대리님 몫).
   - 스크립트가 "주의"(메타디스크립션 없음·1,500자 미만·제목 45자 초과)를 붙인 건은 반영은 하되 답변에 적어 대리님이 고칠 수 있게 한다.
   - D 기록의 summary 에 "GPT 최종본 반입 N건" 을 넣는다.

6. **D. 근무 기록 (반드시 마지막에)** — title `ahj_patch_chunk_YYYY-MM-DD_routine_analysis.json` 으로 업로드:

```
[{"op":"push","list":"routineRuns","match":{"id":"rr-YYYYMMDD-analysisCheck"},"fields":{
  "id":"rr-YYYYMMDD-analysisCheck","job":"analysisCheck","at":"<지금 ISO8601>",
  "status":"ok" | "hold" | "fail",
  "summary":"<한 줄 — 예: 권리분석 체크 3건 반영 · 발행 확인 1건 · 글 없는 미작성 5건>",
  "detail":"<체크한 사건번호·단지명·글 주소, 발행완료로 바꾼 글, 글이 없어 못 켠 물건 목록, 막힌 게 있으면 사유>"}}]
```
   - 0건 처리라도 정상이면 `ok`. 도구·스크립트 오류로 못 한 것만 `fail`.

끝나면 **새로 체크한 물건(사건번호·단지명·글 게시일)**, **발행완료로 바꾼 글(제목·주소)**, **GPT 최종본 반입 결과(글id·글자 수·주의사항)**, **아직 글이 없어 미작성으로 남은 물건 목록**, 올린 파일명을 한국어로 짧게 알려줘.