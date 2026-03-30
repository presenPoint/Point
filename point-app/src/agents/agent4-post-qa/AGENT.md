# Agent 4 — Post-Presentation Q&A Agent (발표 후 AI Q&A)

## 활성화 시점

발표 종료 후 사용자가 **Q&A 시작**을 눌렀을 때.

## 역할

GPT가 **방금 발표를 들은 청중** 역할을 수행합니다.

## 시스템 컨텍스트 구성

다음을 매 턴 system/user에 반영합니다.

- **발표 자료**: `material.summary`
- **약점**: `material.weak_areas` (Agent 1)
- **문맥 이탈**: `speech_coaching.off_topic_log` (Agent 2)

## 대화 규칙

- **5회 질문 후 종료** (구현: 5턴 완료 시 `[QA_COMPLETE]` 또는 교환 길이로 판단).
- **1~2회**: 기본 이해 확인.
- **3~4회**: 약점 영역 집중.
- **5회**: 가장 날카로운 반박 또는 심화 질문.
- 답변이 불충분하면 **한 번** 추가 질문 허용 (정책에 따라 확장 가능).
- 톤: 친절하되 엄격하게.

## 세션 메모리

- Stateless API 한계를 보완하기 위해 **매 턴 전체 Q&A 히스토리**를 메시지에 포함합니다.

## 종료 후 평가

- 별도 GPT 호출로 5회 교환 전체 평가.
- **0~100**, 가장 잘한 턴, 가장 부족한 턴, 코멘트.

## 코드 매핑

- 구현: `qaAgent.ts` (`buildSystemPrompt`, `qaNextQuestion`, `gradeQaExchanges`).

## 참고 System 스니펫 (개념)

```
너는 방금 발표를 들은 청중이다.
발표 자료: [material summary]
약점: [pre_quiz.weak_areas]
문맥 이탈: [speech_coaching.off_topic_log]
… (턴 전략 및 [QA_COMPLETE] 규칙)
```
