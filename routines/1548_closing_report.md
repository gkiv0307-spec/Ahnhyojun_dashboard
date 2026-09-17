매일 15:48 KST 업무마감보고 시간입니다.

**중요 — 원본 저장 시각이 들쭉날쭉하다.** 실측: 9/09 15:34, 9/10 15:45, 9/12 15:47, 9/11 15:50. "15:40 저장"이라고 알고 있었지만 실제로는 15:34~15:50 사이다. 그래서 시작을 15:48로 늦췄다. 그래도 없으면 포기하지 말고 아래 A-4 재시도 규칙을 따른다.

시작하자마자 지금 시각(ISO8601)을 `startedAt` 으로 기억해 둔다.

도구가 "세션 만료"나 연결 오류로 실패하면 ToolSearch로 다시 로드해 최대 2번까지 재시도한다. 학생 이름·연락처·계좌 같은 개인정보는 보고서 본문에 넣지 않는다. 스냅샷 전체(ahj_dashboard_snapshot.json)를 수정·재업로드하지 않는다. **업무일지 원본 문서는 절대 수정·삭제하지 않는다. 읽기만 한다.**

## A. 원본 업무일지 읽기

1. `mcp__Google_Drive__search_files` query: `parentId = '1ZZysuh-y_E3iEwH8O6h93teygbX_jige'`
2. 제목이 `업무일지_<오늘 KST 날짜>` 로 시작하는 파일을 고른다. Google 문서면 `mcp__Google_Drive__read_file_content`, `.md`/`.json` 이면 `mcp__Google_Drive__download_file_content` 로 읽는다.
3. **어제 날짜 문서에 대한 마감본(`wr-<어제>-closing`)이 없으면 그것도 같이 만든다.** 놓친 날을 그냥 버리지 않는다.
4. 오늘 문서가 없으면 — **`send_later` 로 12분 뒤 이 세션에 다시 알림을 걸고**(message: "업무마감보고 재시도 — 오늘 업무일지 원본이 15:48에 없었다. 지금 다시 확인해서 있으면 A~D를 수행하고, 없으면 D에 hold로 기록하고 끝낸다."), 이번 회차는 아무 것도 올리지 않고 끝낸다. **재시도는 하루 한 번만.** 이미 재시도로 들어온 회차인데도 없으면 D에 status `hold`, summary "오늘 업무일지 원본 없음(저장 확인 필요)" 으로 기록하고 끝낸다. **문서를 새로 만들지 않는다.**
5. 제목에 `CODEX`·`GPT`·`최종` 이 들어간 GPT 최종본이 있으면 그것도 읽는다. **없으면 없는 대로 진행하고, ⑤와 D 기록에 "GPT 최종본 미제출" 이라고 남긴다. GPT 대화에는 접근할 수 없으므로 있는 척하지 않는다.**

## B. 최종 업무마감보고 작성

읽은 원본 + 오늘 Drive 폴더 `1ZkIT6DPRGBg8DYu9ezNTEjo6ekUJMvZ4` 에 올라온 청크 파일명·시각을 근거로 정리한다.

```
제목: 업무마감보고
보고일: YYYY년 MM월 DD일
작성자: 부동산팀 안효준 대리
```

① 결과물 — 실제 완료한 업무와 산출물
② 성과 — 완료한 업무로 확인된 효과. 확인 안 된 건 "집계 예정"
③ 전일·전주 대비 — 이전 기록과 비교. 자료가 없으면 "비교 자료 미확보"
④ 문제 — 발생한 문제와 업무에 미치는 영향
⑤ 해결·자동화 — 실행한 조치와 반복 업무 개선. "조치 완료" 와 "진행 중" 을 구분
⑥ 우선업무 — 다음 근무일 우선순위, 기한, 협조 담당자

지킬 것:
- 각 건 앞에 **완료 / 진행 / 예정** 중 하나를 붙인다.
- **실적과 수치를 추정하지 않는다.** 원본이나 청크에서 확인된 숫자만 쓴다. 근거가 없으면 "집계 예정" 또는 "비교 자료 미확보".
- 원본에 없는 사실을 지어내지 않는다.

## C. 대시보드에 올리기

`ahj_patch_chunk_YYYY-MM-DD_closing.json` 을 폴더 `1ZkIT6DPRGBg8DYu9ezNTEjo6ekUJMvZ4` 에 업로드한다
(contentMimeType "application/json", disableConversionToGoogleType true).

```json
[{"op":"set","list":"workReports","match":{"id":"wr-<보고일>-closing"},"upsert":true,"fields":{
  "id":"wr-<보고일>-closing","date":"<보고일 YYYY-MM-DD>","period":"일간",
  "createdAt":"<지금 ISO8601>","generatedAt":"<지금 ISO8601>","collectedAt":"<지금 ISO8601>",
  "source":"closing","author":"부동산팀 안효준 대리","revision":1,
  "sourceFormat":"gdoc","sourceFile":"<읽은 원본 문서 제목들>","sourceUrl":"<원본 문서 링크>",
  "gptIncluded": true 또는 false,
  "sections":{"deliverables":"…","outcomes":"…","comparison":"…","problems":"…","solutions":"…","priorities":"…"},
  "summary":"제목: 업무마감보고\n보고일: …\n작성자: 부동산팀 안효준 대리\n\n① …"
}}]
```

- id 를 `wr-<날짜>-closing` 으로 고정하므로 같은 날 다시 돌려도 **새로 만들지 않고 갱신**된다.
- 대시보드가 폴더에서 직접 읽는 `wr-<날짜>-ai`(원본) · `wr-<날짜>-codex`(GPT 최종본) 와 id 가 달라 **서로 덮어쓰지 않는다.**
- `list` 는 `workReports` 만 쓴다.
- 어제치까지 만들었으면 한 파일에 두 개를 배열로 넣어도 되고, 파일을 나눠도 된다.

## D. 근무 기록 남기기 (반드시 마지막에)

`ahj_patch_chunk_YYYY-MM-DD_routine_closing.json` 으로 업로드한다:

```json
[{"op":"push","list":"routineRuns","match":{"id":"rr-YYYYMMDD-closingReport"},"fields":{
  "id":"rr-YYYYMMDD-closingReport","job":"closingReport",
  "startedAt":"<A 시작 시각 ISO8601>","finishedAt":"<지금 ISO8601>","at":"<지금 ISO8601>",
  "status":"ok" | "hold" | "fail",
  "summary":"<한 줄 요약. 예: 마감보고 1건 작성 · 원본 1건 참조 · GPT 최종본 미제출>",
  "detail":"<읽은 원본 문서 제목, 원본이 실제로 저장된 시각, 올린 파일명, 재시도 여부, 못 한 게 있으면 사유>"}}]
```

업로드 후 폴더에서 파일이 실제로 생겼는지 확인한다.
끝나면 **시작 시각 · 완료 시각 · 소요 시간 · 원본이 저장된 시각**, ①~⑥ 요약, 올린 파일명, GPT 최종본 반영 여부를 한국어로 짧게 알려줘.