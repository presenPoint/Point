-- Migration 006: 세부 분석 지표 컬럼 추가
-- sessions 테이블에 WPM, 필러워드, 비언어 세부 점수 등을 저장합니다.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS wpm_avg         SMALLINT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS filler_count    SMALLINT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS off_topic_count SMALLINT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS posture_score   SMALLINT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS gaze_score      SMALLINT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS gesture_score   SMALLINT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS persona_used    TEXT;
