사용자가 Agent 2-A Rule Engine에 새 언어 코칭 규칙을 추가할 수 있도록 단계별로 안내하세요.

## 컨텍스트

Point의 실시간 언어 코칭 규칙 시스템 구성:
- `src/lib/speechUtils.ts` — 상수 정의 (threshold, window 등)
- `src/agents/agent2-live-speech/rule/speechRule.ts` — 규칙 로직 (`onTranscriptChunk`)
- `src/types/session.ts` — 로그 타입 (새 로그가 필요한 경우)
- `src/store/sessionStore.ts` — `speech_coaching` 초기값
- `src/agents/agent5-report/reportAgent.ts` — 점수 계산 (리포트에 반영할 경우)

기존 규칙 목록 (SKILLS.md §6):
| 규칙 | 위치 |
|---|---|
| WPM (속도) | `onTranscriptChunk` |
| 추임새 (filler) | `onTranscriptChunk` |
| 침묵 감지 | `useLivePresenting.ts` |
| 볼륨 조용/하강/단조/불균일 | `volumeAnalyzer.ts` |

FeedbackQueue 사용 패턴:
```typescript
feedbackQueue.push({
  level: 'CRITICAL' | 'WARN' | 'INFO',
  msg: '피드백 메시지',
  source: 'SPEECH_RULE',
  cooldown: 15_000,   // ms — 중복 억제
  silent: true,       // 선택사항: UI 표시 없이 로그만
});
```

## 절차

### Step 1 — 규칙 정보 수집

사용자에게 다음을 물어보세요 (한 번에):
1. **규칙 이름** — 무엇을 감지하는 규칙인지
2. **감지 방식** — 어떤 데이터로 판단하는지 (transcript 텍스트, 시간, 카운트 등)
3. **임계값** — 언제 피드백을 발행할지 기준
4. **피드백 레벨** — `CRITICAL` / `WARN` / `INFO`
5. **쿨다운** — ms 단위 (중복 방지 간격)
6. **리포트 반영 여부** — 점수 계산에 포함할지
7. **로그 저장 여부** — `SessionContext`에 기록할지

### Step 2 — 파일 수정

수집한 정보를 바탕으로 아래를 실행하세요:

#### 2-1. `src/lib/speechUtils.ts`에 상수 추가
새 임계값·윈도우 값을 export 상수로 추가:
```typescript
export const <RULE_NAME>_THRESHOLD = <값>;
export const <RULE_NAME>_WINDOW_MS = <값>;
```

#### 2-2. `src/agents/agent2-live-speech/rule/speechRule.ts`에 로직 추가
- `onTranscriptChunk` 내부에 추가하거나
- 독립 함수로 분리 후 `onTranscriptChunk`에서 호출

예시 패턴:
```typescript
// 새 규칙 로직
const <condition> = <감지 조건>;
if (<condition>) {
  feedbackQueue.push({
    level: 'WARN',
    msg: '피드백 메시지',
    source: 'SPEECH_RULE',
    cooldown: <RULE_NAME>_WINDOW_MS,
  });
}
```

#### 2-3. `src/types/session.ts` 수정 (로그 저장 시만)
`speech_coaching` 타입에 새 필드 추가:
```typescript
<rule_name>_count?: number;
<rule_name>_log?: { timestamp: number; value: string }[];
```

#### 2-4. `src/store/sessionStore.ts` 수정 (로그 저장 시만)
`speech_coaching` 초기값에 새 필드 추가:
```typescript
<rule_name>_count: 0,
<rule_name>_log: [],
```

#### 2-5. `src/agents/agent5-report/reportAgent.ts` 수정 (리포트 반영 시만)
`calcSpeechScore`에 새 지표 반영. 기존 가중치 합이 1.0이 유지되도록 조정할 것.

### Step 3 — 타입 검증

모든 파일 수정 후 반드시 실행:
```bash
npx tsc --noEmit
```
에러가 있으면 수정 후 다시 확인.

### Step 4 — 결과 요약

완료 후 알려줄 것:
- 추가된 규칙 동작 방식 한 줄 설명
- 수정된 파일 목록
- 리포트/로그 반영 여부
- 타입 검증 결과
