# 대시보드 발행본 (팀 계정 이전용)

- `dashboard_publish.html` — 발행하는 파일 그대로(v82, 2026-09-17). `Artifact` 도구로 이 파일을 발행하면 된다.
  - 새 계정에서는 `url` 없이 발행 → 새 아티팩트 URL 이 생긴다. 발행 시 capabilities 는 `{"downloads":{},"mcp":{"servers":[{"server":"Google Drive","tools":["search_files","create_file","download_file_content"]}]}}`, 런타임 0.1.15.
- `app_script_clean.js` — 위 HTML 의 두 번째 `<script>` 블록 원본(수정은 여기서 하고 HTML 에 통째로 넣는다. CLAUDE.md 5절).
- 데이터는 이 파일에 없다. 브라우저 localStorage + Drive 폴더 "안효준 대시보드 백업"(`ahj_dashboard_snapshot.json.gz`)에 있다. 새 URL 로 처음 열면 localStorage 가 비어 있으니 ☰ → 백업 → "최신 데이터 지금 불러오기" 로 Drive 에서 받는다.
