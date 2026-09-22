매일 아침 블로그 제작 파이프라인 실행 시간입니다. 5명의 AI 직원이 순서대로 이어받는 방식으로 진행합니다. 각 직원 역할을 실제로 수행해 하나의 배치로 만들어줘 (이 대화의 맥락·CLAUDE.md·.claude/skills의 blog-* 스킬 규칙을 그대로 따르면 돼). 도구가 "세션 만료"로 실패하면 ToolSearch로 다시 로드해서 한 번 더 시도한다.

**0단계 - 생산량 조절 (먼저 확인)**: Google Drive 폴더(parentId: 1ZkIT6DPRGBg8DYu9ezNTEjo6ekUJMvZ4)에서 스냅샷을 **정확한 제목으로** 검색해(`(title = 'ahj_dashboard_snapshot.json.gz' or title = 'ahj_dashboard_snapshot.json') and parentId = '1ZkIT6DPRGBg8DYu9ezNTEjo6ekUJMvZ4'`, modifiedTime 최신 것 — `title contains` 로 찾으면 이름을 바꿔 둔 옛 파일 `…이전전보관…` 이 최신으로 잘못 잡힌다) 내려받는다. 2026-09-16 부터 gzip 압축본이며 base64 디코드 후 바이트가 `1f 8b` 로 시작하면 gzip.decompress 로 푼다) blogPosts 중 status가 "발행대기"인 개수를 센다(본문은 읽지 않는다). 발행대기가 20건 이상이면 오늘은 새 글을 만들지 않고, {runAt, status:"no_new", addedCount:0, note:"발행대기 N건 적체 — 대기 글 소진 우선", items:[]} 만 업로드한 뒤 **아래 6단계(근무 기록)까지 하고** 끝낸다. 10~19건이면 오늘은 최대 1건만 만든다. 10건 미만이면 1~2건을 만든다. 실제로 게시된 글이 최근에 늘었는지도 함께 적는다.

**1단계 - 🔍 아이디어 직원** (job key `blogPipeline`): WebSearch로 최근(최근 며칠 내) 자료를 조사해 블로그 소재 아이디어를 0단계에서 정한 개수만큼 만든다. 세 주제를 골고루: (a) 부동산 경매 관련 최신 뉴스·정책 변화 (b) 대구 등 특정 지역 부동산 시황(낙찰가율·매물동향) (c) 경매 입찰·낙찰 실전 팁/사례. 최근 7일 소재와 60% 이상 달라야 한다. 각 아이디어에 제목(헤드라인 톤), 주제/키워드, 요약+출처 URL을 담은 메모를 만든다. 정말 소재가 없으면 억지로 만들지 말고 0개로 두되 그 사실을 note에 남긴다.

**2단계 - 🕵️ 정보검수 직원** (job key `blogFactCheck`): 아이디어마다 핵심 통계·사실관계가 출처 URL의 실제 내용과 일치하는지 WebFetch나 재검색으로 원문을 직접 대조한다. 일치하면 다음 단계로 넘긴다. 확인이 안 되거나 의심스러우면 그 아이디어는 여기서 멈추고 5단계(보류)로 보낸다.

**3단계 - ✍️ 작성 직원** (job key `blogWrite`): 정보검수를 통과한 아이디어만 본문을 작성한다. 본문 맨 첫 줄은 반드시 "메타디스크립션: " 으로 시작하는 160자 이내 한 줄. 공백 포함 1,500~2,500자, "안녕하세요, 옆커폰부동산에듀입니다."로 시작하는 친절한 안내 톤, 질문형 소제목 2개 이상, 마지막에 "핵심 정리"와 "자주 묻는 질문", 해시태그 5개 이상. 글자 수를 직접 세어 1,500자 미만이면 보강한다.

**4단계 - 📐 SEO검수·발행 직원** (job key `blogSeo`): **제목 45자 이하**(글자 수를 직접 셀 것), 핵심 키워드가 제목과 첫 문단에 있는지, 메타디스크립션 줄이 리터럴로 있는지, 질문형 소제목·핵심정리·FAQ·해시태그 5개 이상, 1,500자 이상, 금지 표현 없음을 전부 확인한다. 금지 표현은 **단어가 아니라 단정하는 문장**을 말한다 — "무조건 안전한 건 아닙니다" 같은 부정·반문은 통과시킨다. 충족하면 "발행대기"로 올린다. 미달이면 어떤 항목이 왜 미달인지 구체적으로 적어 5단계로 넘긴다.

**5단계 - 🧑‍⚖️ 최종검토 직원** (job key `blogApprove`): 걸러진 항목은 "보류"로 확정하고 구체적인 사유(holdReason)를 남긴다. "발행대기"까지 온 항목은 승인 메모만 남긴다.

**결과 취합**: 오늘 처리한 모든 아이디어(보류 포함)를 다음 형태의 객체 배열로 만든다. 각 항목은 거쳐간 단계마다 stageLog에 기록을 남긴다:
{ id(고유 문자열), date(오늘), title, topic, status("아이디어"|"정보검수중"|"작성중"|"SEO검수중"|"발행대기"|"보류" 중 실제 멈춘 단계), url:"", memo(요약+출처), body(3단계까지 갔다면 본문, 아니면 ""), createdAt(ISO), stageLog:[{stage, by, at, note}...], holdReason(보류인 경우만) }

이 배열을 { runAt(지금 ISO), status:"success"|"no_new"|"error", addedCount(배열 길이), note(사유 요약, 정상이면 빈 문자열), items:[…] } 로 감싸서 title "ahj_blog_chunk_YYYY-MM-DD.json"(오늘 날짜, parentId 위와 같음, contentMimeType "application/json", disableConversionToGoogleType true)으로 업로드한다.

**6단계 - 근무 기록 남기기 (반드시 마지막에, 0건으로 끝나도 한다)**

대시보드 "효제이 AI직원팀 → 업무 분장 · 루틴 상태" 카드가 이 기록을 읽어 **직원별로 돌았는지 / 무엇이 막혔는지**를 보여준다. 기록을 안 남기면 대리님 화면에 "미실행"으로 뜬다.

오늘 실제로 수행한 단계마다 아래 객체를 만들어 **하나의 배열**로 묶고, title "ahj_patch_chunk_YYYY-MM-DD_routine.json"(오늘 날짜, 같은 폴더, contentMimeType "application/json", disableConversionToGoogleType true)으로 업로드한다. 0단계에서 멈췄으면 `blogPipeline` 하나만 status:"hold"로 남긴다.

```
{"op":"push","list":"routineRuns","fields":{
  "id":"rr-YYYYMMDD-<jobkey>", "job":"<blogPipeline|blogFactCheck|blogWrite|blogSeo|blogApprove>",
  "at":"<지금 ISO8601>", "status":"ok" | "hold" | "fail",
  "summary":"<한 줄 요약 — 숫자 위주. 예: 소재 2건 발굴 / 발행대기 24건 적체로 생산 보류>",
  "detail":"<무엇을 했는지, 막혔으면 사유>"}}
```

- 정상 수행 = `ok`. 조건 때문에 일부러 안 한 것 = `hold`. 도구 오류로 못 한 것 = `fail`.
- 업로드 후 폴더에서 파일이 생겼는지 확인한다.

**7단계 - GPT 교환 폴더 내보내기 (0단계에서 보류로 끝났어도 한다)**

발행대기 글을 대리님이 GPT(ChatGPT)로 다듬을 수 있게 Drive 폴더 "블로그 GPT 교환"(parentId `1FiETh0OJuly14r6GQ0tgh5nXp-Lkc_pd`)에 글마다 `.md` 파일로 내보낸다.
1. 폴더 목록을 읽는다: `mcp__Google_Drive__search_files` query `parentId = '1FiETh0OJuly14r6GQ0tgh5nXp-Lkc_pd'` (excludeContentSnippets true, pageSize 100). 제목이 `<글id>.md` 인 파일의 글id 목록을 만든다(`_GPT최종` 이 붙은 파일은 제외).
2. `python3 /home/user/yeopkerphone-auction-site/scripts/blog_gpt_export.py snapshot.json gpt_out --skip <이미 있는 글id를 쉼표로>` — 오늘 만든 글은 스냅샷에 없으므로, 오늘 발행대기로 올린 항목(있다면)은 스냅샷 blogPosts 에 같은 모양으로 덧붙인 임시 파일을 만들어 넘긴다.
3. 새로 만들어진 `gpt_out/<글id>.md` 마다 `mcp__Google_Drive__create_file`(title `<글id>.md`, parentId 위 폴더, contentMimeType "text/markdown", disableConversionToGoogleType true, textContent 파일 내용)로 올린다. 이미 있는 글은 다시 올리지 않는다(같은 이름 중복 방지).
4. 6단계 근무 기록의 `blogApprove`(보류로 끝났으면 `blogPipeline`) detail 에 "GPT 교환 폴더 내보내기 N건(신규)" 를 한 줄 덧붙인다.
- 발행완료로 바뀐 글의 `.md` 는 지우지 않는다(대리님이 폴더 정리). 파일 안 `- 글ID:` 줄은 대시보드가 글을 찾는 키이므로 형식을 바꾸지 않는다.

절대 스냅샷(ahj_dashboard_snapshot.json / .json.gz) 전체를 수정·재업로드하지 않는다. 대시보드 아티팩트 코드는 재배포하지 않는다. 학생 이름·연락처·매출 등 민감정보는 다루지 않는다.

끝나면 발행대기 적체 상황(몇 건), 오늘 만든 개수와 그 이유, 각 아이디어가 어디까지 갔는지(발행대기 몇 건, 보류 몇 건과 사유), 올린 파일명을 한국어로 짧게 요약해서 알려줘.