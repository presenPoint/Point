# Agent 5 — Report & Analytics Agent (종합 리포트)

## 활성화 시점

Q&A 종료 직후 **자동** 실행 (`sessionStore.runReport`).

## 역할

세션 전체 데이터를 통합해 리포트를 생성하고 **Supabase**에 저장합니다.

## 점수 계산 (가중치)

### 언어 (40%)

- WPM 목표 범위 유지 비율
- 추임새: `(1 - 추임새/총발화)` 스타일 또는 구현된 감점
- 문맥 유지: `off_topic` 발생 횟수 기반 감점
- 모호 표현 등 Semantic 관련 지표

### 비언어 (30%)

- 시선 응시율
- 자세 안정성
- 제스처 균형(과다/부족)

### Q&A (30%)

- 종료 시 GPT 평가 점수 (`qa.final_score`)

구현: `reportAgent.ts`의 `calcCompositeScore`.

## GPT 내러티브

수치·로그를 GPT에 넘겨 **잘한 점 3**, **개선할 점 3**을 자연어로 생성합니다.

- 단순 점수 나열 금지.
- 가능하면 시각·구간 근거 (예: "문맥 이탈 로그의 발화 발췌").

## Supabase 저장 구조 (목표 스키마)

- `sessions`: `session_id`, `user_id`, `started_at`, `ended_at`, `composite_score`, …
- `speech_logs`: `session_id`, `timestamp`, `type` (wpm/filler/off_topic), `value`
- `nonverbal_logs`: `session_id`, `timestamp`, `type` (gaze/posture/gesture), `value`
- `qa_exchanges`: `session_id`, `turn`, `question`, `answer`, `score`
- `reports`: `session_id`, `scores_json`, `strengths_json`, `improvements_json` (또는 컬럼 분해)

현재 앱의 `persistSession`과 맞춰 점진적으로 확장합니다.

## 코드 매핑

- `reportAgent.ts`: `calcCompositeScore`, `generateReportNarrative`
- 저장: `store/sessionStore.ts` → `persistSession`
