# 자동 루틴 원문 (계정 이관용 보관본, 2026-11-10 기준)

대시보드 세션에 바인딩된 Claude Code 예약 작업 5개의 이름·시각·프롬프트를 그대로 옮겨 적었다.
새 계정에서 `create_trigger` 로 다시 만들 때 아래 파일 내용을 prompt 에 그대로 넣는다.
공통 조건: 저장소 `gkiv0307-spec/Ahnhyojun_dashboard` 브랜치 `claude/dashboard-from-yesterday-p4zuaj` 가 연결된 세션(CLAUDE.md 가 읽힘), Google Drive 커넥터(구글 계정 gkiv0307), 15:48 루틴은 `send_later` 사용.

| 파일 | 이름 | cron(UTC) | KST | 옛 trigger id | 새 계정 trigger id (2026-11-10) |
|---|---|---|---|---|---|
| `01_morning_0706.md` | 아침 점검: PC 수집 경매 결과 반영 + 블로그 발행 확인 + 대표 지시 처리 | `6 22 * * *` | 07:06 | trig_01BvA6VTCjaQVkN93pbwgDgM | trig_01TuG4xqyAnbJYKvygztMWPr |
| `02_blog_pipeline_0800.md` | 블로그 제작 파이프라인 (AI 직원 5명) | `0 23 * * *` | 08:00 | trig_017apcdF32gc1UkJcRUGoU2f | trig_011y8h4bTXUhCFdi7DgGjKpG |
| `03_analysis_noon_1200.md` | 권리분석 체크 낮 회차 | `0 3 * * *` | 12:00 | trig_016Yoe4ydb8kZNxMh241ujXb | trig_012gqKoEoa92BkrSRQ22pDLW |
| `04_closing_1548.md` | 업무마감보고 자동 수집 | `48 6 * * *` | 15:48 | trig_017v14iuXGFcye7ijECz8PZK | trig_01JoXX3aPuQjvGq4w1Z6fm19 |
| `05_analysis_evening_2000.md` | 권리분석 체크 자동 반영 + 발행 확인 저녁 회차 + GPT 최종본 반입 | `0 11 * * *` | 20:00 | trig_012sR8svRraK3bQQ7vksLjud | trig_01STbuW9rJuPZz7jahpEjKWY |

모두 `persist_session: true`(같은 세션에 바인딩), 커넥터 추가 선언 없음(세션 커넥터를 그대로 씀).
새 계정에서 첫 실행이 정상 기록(`routineRuns`)되면 옛 계정의 5개는 `enabled=false` 로 끈다(둘 다 돌면 청크가 겹친다).

2026-11-10 새 계정 세션 `session_01MWyhHSvUADsrsUNmEALQ1v` 에 5개 재생성(프롬프트는 이 폴더 파일 그대로, 스크립트 절대경로만 `/home/user/Ahnhyojun_dashboard/` 로 고침). 대리님 결정: 새 루틴 첫 실행 확인 뒤 옛 계정 5개를 끈다(그 사이 하루는 청크가 겹칠 수 있음).
