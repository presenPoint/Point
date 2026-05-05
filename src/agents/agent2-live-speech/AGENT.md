# Agent 2 — Live Speech Coaching Agent (실시간 언어 코칭)

## 활성화 시점

발표 시작 시. **Agent 3(비언어)** 과 동시에 활성화.

## 구조

### 2-A. Rule Engine (규칙 기반 — 실시간, API 없음)

Web Speech API 텍스트 스트림을 **발화 청크마다** 처리.

- **WPM**: 5초 슬라이딩 윈도우로 분당 단어 수 추정(공백 기준 토큰). 기본 목표 **100~180 wpm**(구현은 `lib/speechUtils`·`rule/speechRule.ts` 참고). 페르소나 선택 시 페르소나의 `wpmRange`로 대체. 범위 이탈 시 오버레이 피드백.
- **추임새**: 정규식으로 "어", "음", "그", "저기", "뭐지" 등 카운트. **30초 내 3회 이상**이면 경고.
- **침묵**: **3초** 이상 발화 없으면 "발표가 멈췄습니다" 류 트리거.

### 2-B. Semantic Engine (GPT — 비동기, ~30초 주기)

누적 발화 텍스트 청크를 주기적으로 GPT에 전송.

- **문맥 이탈**: `session_context`의 material summary와 비교.
- **논리 흐름**: 앞뒤 발화 모순·급전환.
- **구체성 부족**: "대략", "뭔가", "어떤 식으로" 등 반복 시 피드백.

## 피드백 우선순위 (오버레이)

| 수준     | 조건 예시                              |
|----------|----------------------------------------|
| CRITICAL | 문맥 완전 이탈 → 빨간 배너           |
| WARN     | WPM 이탈, 추임새 과다, 모호 반복      |
| INFO     | 속도 양호, 흐름 자연스러움(소형)      |

- 동시 표시 **최대 2개**, **15초 쿨다운**(`FeedbackQueue` 정책과 일치).
- **Rule Engine 피드백이 Semantic보다 항상 우선**되도록 소스·우선순위를 큐에서 정렬.

## 출력 (`session_context`)

- `speech_coaching.wpm_log`, `filler_*`, `off_topic_log`, `ambiguous_count`, `total_duration_sec` 등.

## 코드 매핑

- Rule: `rule/speechRule.ts`
- Semantic: `semantic/speechSemantic.ts`
- 큐: `../shared/feedbackQueue.ts`
