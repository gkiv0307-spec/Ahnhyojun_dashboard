-- 유입 분석용 D1 스키마
-- Cloudflare Pages > Settings > Functions > D1 database bindings 에 변수명 DB 로 연결한다.
-- (테이블은 /api/track 이 처음 호출될 때 자동 생성되므로 이 파일을 수동 실행하지 않아도 된다.
--  수동으로 만들고 싶으면: wrangler d1 execute <DB이름> --remote --file=schema.sql)

CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            INTEGER NOT NULL,   -- 수신 시각(epoch ms, 서버 기준)
  day           TEXT    NOT NULL,   -- KST 기준 YYYY-MM-DD
  hour          INTEGER NOT NULL,   -- KST 기준 0~23
  type          TEXT    NOT NULL,   -- pageview | click
  session_id    TEXT    NOT NULL,   -- 방문(세션) 식별자, 30분 무활동 시 갱신
  visitor_id    TEXT,               -- 브라우저 단위 익명 식별자
  seq           INTEGER,            -- 세션 내 페이지 순번(1부터)
  is_new        INTEGER,            -- 1이면 첫 방문자
  path          TEXT,               -- 현재 페이지 경로
  title         TEXT,
  label         TEXT,               -- click 이벤트 라벨(전화상담 등)
  landing_path  TEXT,               -- 세션의 첫 페이지
  referrer      TEXT,               -- 세션 시작 시점의 전체 referrer
  ref_domain    TEXT,               -- referrer 도메인
  channel       TEXT,               -- 네이버 검색 / 네이버 블로그 / 카카오톡 / 직접 유입 ...
  source        TEXT,               -- utm_source 또는 referrer 도메인
  medium        TEXT,               -- utm_medium 또는 organic/referral/direct
  campaign      TEXT,
  term          TEXT,
  content       TEXT,
  device        TEXT,               -- mobile | tablet | desktop
  os            TEXT,
  browser       TEXT,
  country       TEXT,
  region        TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_day     ON events(day);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, seq);
CREATE INDEX IF NOT EXISTS idx_events_channel ON events(day, channel);
