# Point — Agent Architecture

> **문서 버전**: v1.0 · 2026  
> **범위**: MVP 2개월 빌드 기준  
> **스택 전제**: React + TypeScript · Supabase · OpenAI GPT-4o · Web Speech API · MediaPipe · Web Worker

---

## 목차

1. [전체 아키텍처 개요](#전체-아키텍처-개요)
2. [공유 데이터 구조 — SessionContext](#공유-데이터-구조--sessioncontext)
3. [Agent 0 — Session Orchestrator](#agent-0--session-orchestrator)
4. [Agent 1 — Material & Quiz Agent](#agent-1--material--quiz-agent)
5. [Agent 2 — Live Speech Coaching Agent](#agent-2--live-speech-coaching-agent)
6. [Agent 3 — Live Nonverbal Coaching Agent](#agent-3--live-nonverbal-coaching-agent)
7. [Agent 4 — Post-Presentation Q&A Agent](#agent-4--post-presentation-qa-agent)
8. [Agent 5 — Report & Analytics Agent](#agent-5--report--analytics-agent)
9. [Cross-Agent — FeedbackQueue](#cross-agent--feedbackqueue)
10. [DB 스키마](#db-스키마)
11. [에이전트 간 데이터 흐름](#에이전트-간-데이터-흐름)
12. [GPT 호출 비용 추정](#gpt-호출-비용-추정)

---

## 전체 아키텍처 개요

Point는 하나의 발표 세션을 5단계로 분리하고, 각 단계를 전담하는 에이전트가 순서대로 활성화되는 구조입니다. 에이전트들은 독립적으로 동작하되, 공유 `SessionContext`를 통해 서로의 출력을 참조합니다.

```
┌─────────────────────────────────────────────────────────────┐
│                   Agent 0 · Session Orchestrator            │
│              (상태 머신 · 에이전트 생명주기 관리)              │
└───────┬──────────┬─────────────────────┬────────────────────┘
        │          │                     │
   [PRE 단계]  [LIVE 단계]          [POST 단계]
        │          │                     │
   Agent 1    Agent 2 + Agent 3      Agent 4 → Agent 5
  자료·퀴즈   언어·비언어 (병렬)      Q&A → 리포트
```

### 에이전트별 실행 환경

| Agent | 실행 위치 | GPT 사용 | 실시간 여부 |
|---|---|---|---|
| 0 · Orchestrator | React Main Thread | ✗ | 상시 |
| 1 · Material & Quiz | React Main Thread | ✓ GPT-4o | 비실시간 |
| 2-A · Speech Rule | React Main Thread | ✗ | 실시간 (0ms) |
| 2-B · Speech Semantic | React Main Thread | ✓ GPT-4o-mini | 30초 주기 |
| 3 · Nonverbal | Web Worker | ✗ MediaPipe | 실시간 (5fps) |
| 4 · Q&A | React Main Thread | ✓ GPT-4o | 비실시간 |
| 5 · Report | React Main Thread | ✓ GPT-4o | 발표 종료 후 1회 |

---

## 공유 데이터 구조 — SessionContext

모든 에이전트가 읽고 쓰는 공유 컨텍스트입니다. Zustand store에서 관리하며, 세션 종료 시 Supabase에 직렬화하여 저장합니다.

```typescript
interface SessionContext {
  // 세션 메타
  session_id: string;
  user_id: string;
  status: 'IDLE' | 'PRE_QUIZ' | 'PRESENTING' | 'POST_QA' | 'REPORT' | 'DONE';
  started_at: string;         // ISO timestamp
  ended_at?: string;

  // Agent 1 출력
  material: {
    raw_text: string;         // 업로드 원문
    summary: string;          // GPT 3~5문장 요약
    keywords: string[];       // 핵심 키워드
    quiz: QuizItem[];         // 사전 퀴즈 3문항
    pre_quiz_score: number;   // 0~100
    weak_areas: string[];     // 취약 영역 — Agent 4가 집중 공략
  };

  // Agent 2 출력
  speech_coaching: {
    wpm_log: WpmEntry[];           // { timestamp, wpm } 30초마다
    filler_count: number;          // 누적 추임새 횟수
    filler_timestamps: number[];   // 추임새 발생 시각
    off_topic_log: OffTopicEntry[];// { timestamp, excerpt, reason }
    ambiguous_count: number;       // 모호 표현 횟수
    total_duration_sec: number;
  };

  // Agent 3 출력
  nonverbal_coaching: {
    gaze_rate: number;             // 0~1, 청중 응시율
    gaze_log: GazeEntry[];         // { timestamp, is_gazing }
    posture_log: PostureEntry[];   // { timestamp, angle, is_ok }
    gesture_log: GestureEntry[];   // { timestamp, type: 'excess'|'lack' }
  };

  // Agent 4 출력
  qa: {
    exchanges: QaExchange[];       // { turn, question, answer, score }
    final_score: number;           // 0~100
    best_answer_turn: number;
    worst_answer_turn: number;
  };

  // Agent 5 출력
  report: {
    composite_score: number;       // 0~100 종합 점수
    speech_score: number;          // 40% 가중치
    nonverbal_score: number;       // 30% 가중치
    qa_score: number;              // 30% 가중치
    strengths: string[];           // 잘한 점 3가지 (자연어)
    improvements: string[];        // 개선점 3가지 (자연어)
    generated_at: string;
  };
}
```

---

## Agent 0 — Session Orchestrator

### 역할

- 발표 세션의 전체 상태 머신을 관리합니다.
- 각 단계의 시작/종료 신호를 하위 에이전트에 전달합니다.
- 비정상 종료(브라우저 닫힘, 네트워크 단절) 시 세션 상태를 복구합니다.

### 상태 전이

```
IDLE
  └─(파일 업로드 + 퀴즈 완료)→ PRE_QUIZ
      └─(발표 시작 클릭)→ PRESENTING
          └─(발표 종료 클릭)→ POST_QA
              └─(Q&A 5회 완료)→ REPORT
                  └─(리포트 저장 완료)→ DONE
```

### 구현 인터페이스

```typescript
interface SessionOrchestrator {
  // 상태 전이
  transition(to: SessionStatus): void;

  // 에이전트 생명주기
  startAgent(agentId: AgentId): void;
  stopAgent(agentId: AgentId): void;

  // 세션 복구
  recoverSession(session_id: string): Promise<SessionContext | null>;

  // 저장
  persistSession(): Promise<void>;
}
```

### 복구 전략

브라우저가 닫히거나 네트워크가 끊길 경우, `beforeunload` 이벤트에서 현재 `SessionContext`를 Supabase에 부분 저장합니다. 다음 로그인 시 `DONE`이 아닌 세션이 있으면 "이어서 진행하시겠습니까?" 배너를 표시합니다.

---

## Agent 1 — Material & Quiz Agent

### 역할

파일 업로드 시 발표 자료를 분석하고, 사전 퀴즈를 생성·채점하며, 이후 에이전트들이 공통으로 참조하는 `material` 컨텍스트를 구성합니다.

### 처리 흐름

```
파일 업로드 (PDF/TXT)
    ↓
텍스트 추출 (PDF: pdf-parse / TXT: 직접 읽기)
    ↓
[GPT Call 1] 요약 + 키워드 + 퀴즈 3문항 생성
    ↓
사용자에게 퀴즈 표시 → 텍스트 답변 수집
    ↓
[GPT Call 2] 답변 채점 → pre_quiz_score + weak_areas
    ↓
SessionContext.material 저장
```

### GPT Call 1 — 자료 분석 + 퀴즈 생성

**모델**: `gpt-4o`  
**실행 시점**: 파일 업로드 직후 1회  

```
System:
"너는 발표 코치다. 아래 발표 자료를 분석해서 JSON으로만 응답해라.

응답 형식:
{
  "summary": "핵심 내용 3~5문장 요약",
  "keywords": ["키워드1", "키워드2", ...],
  "quiz": [
    {
      "id": 1,
      "question": "이 자료를 실제로 이해했는지 확인하는 서술형 질문",
      "key_points": ["채점 기준 포인트1", "채점 기준 포인트2"]
    },
    ...3문항
  ]
}

규칙:
- 단순 암기형 질문 금지. 반드시 '설명하시오' 형태
- 자료에 없는 내용으로 질문하지 마라
- quiz의 key_points는 채점 시 사용하는 내부 기준이므로 사용자에게 보여주지 않는다"

User: [원문 텍스트 전체]
```

### GPT Call 2 — 답변 채점

**모델**: `gpt-4o-mini` (비용 절감)  
**실행 시점**: 사용자가 퀴즈 3문항 모두 답변 후 1회  

```
System:
"아래 발표 자료와 퀴즈 채점 기준을 바탕으로 사용자 답변을 평가해라.
JSON으로만 응답해라.

응답 형식:
{
  "total_score": 0~100,
  "per_question": [
    { "id": 1, "score": 0~100, "feedback": "한 줄 피드백" },
    ...
  ],
  "weak_areas": ["취약한 주제나 개념 1", "취약한 주제나 개념 2"]
}"
```

### 파일 크기 제한 전략

GPT context window 한계를 고려해 파일 크기에 따라 처리 방식을 분기합니다.

| 파일 크기 | 처리 방식 |
|---|---|
| ~8,000 tokens | 전문 그대로 GPT에 전달 |
| 8,000~20,000 tokens | 섹션별 분할 후 순차 요약 → 합본 요약 생성 |
| 20,000 tokens 초과 | 업로드 거부 + "파일을 줄여주세요" 안내 |

---

## Agent 2 — Live Speech Coaching Agent

### 역할

발표 중 음성 스트림을 실시간 분석해 언어적 문제(말 속도, 추임새, 문맥 이탈, 모호 표현)를 감지하고 오버레이 피드백을 생성합니다.

이 에이전트는 지연 특성이 다른 두 서브 모듈로 구성됩니다.

---

### 2-A. Rule Engine (규칙 기반)

**실행**: Main Thread · Web Speech API 이벤트 핸들러 내부  
**지연**: 0ms (API 호출 없음)  
**트리거**: `SpeechRecognition.onresult` 이벤트마다

#### WPM 측정

```typescript
// 5초 슬라이딩 윈도우
const WINDOW_MS = 5000;
const TARGET_WPM_MIN = 250;  // 음절/분 (한국어 기준)
const TARGET_WPM_MAX = 350;

function calcWpm(buffer: TranscriptEntry[]): number {
  const now = Date.now();
  const window = buffer.filter(e => now - e.timestamp < WINDOW_MS);
  const syllableCount = window.reduce((acc, e) => acc + countSyllables(e.text), 0);
  return Math.round((syllableCount / WINDOW_MS) * 60_000);
}

// 피드백 트리거
if (wpm > TARGET_WPM_MAX)  → FeedbackQueue.push({ level: 'WARN', msg: '말이 너무 빠릅니다' })
if (wpm < TARGET_WPM_MIN)  → FeedbackQueue.push({ level: 'WARN', msg: '조금 더 빠르게 말해보세요' })
```

#### 추임새 감지

```typescript
const FILLER_PATTERNS = /\b(어+|음+|그+|저기|뭐지|있잖아|그러니까|뭐랄까)\b/g;
const FILLER_THRESHOLD = 3;   // 30초 내 3회 이상 → 경고
const FILLER_WINDOW_MS = 30_000;

// 매 발화 청크마다 검사
function detectFillers(text: string, history: FillerEntry[]): void {
  const matches = text.match(FILLER_PATTERNS) ?? [];
  matches.forEach(m => {
    history.push({ word: m, timestamp: Date.now() });
    FeedbackQueue.push({ level: 'INFO', msg: `추임새 감지: "${m}"`, silent: true });
  });

  const recentCount = history.filter(e => Date.now() - e.timestamp < FILLER_WINDOW_MS).length;
  if (recentCount >= FILLER_THRESHOLD) {
    FeedbackQueue.push({ level: 'WARN', msg: '추임새가 반복되고 있어요', cooldown: 30_000 });
  }
}
```

#### 침묵 감지

```typescript
const SILENCE_THRESHOLD_MS = 3_000;

// 마지막 onresult 이후 3초 경과 시
setTimeout(() => {
  FeedbackQueue.push({ level: 'INFO', msg: '발표가 잠시 멈췄습니다' });
}, SILENCE_THRESHOLD_MS);
```

---

### 2-B. Semantic Engine (GPT 기반)

**모델**: `gpt-4o-mini`  
**실행**: Main Thread · 30초 인터벌 타이머  
**지연**: 평균 2~5초 (비동기, 피드백은 도착 즉시 표시)

#### 분석 항목

- **문맥 이탈**: 발화 내용이 `material.summary`에서 크게 벗어났는지
- **논리 흐름**: 앞 발화와 현재 발화 사이의 급격한 주제 전환 또는 모순
- **모호 표현**: "대략", "뭔가", "어떤 식으로", "나름대로" 등의 반복

#### GPT 프롬프트

```
System:
"너는 발표 코치다. 발표자의 최근 30초 발화를 분석해서 JSON으로만 응답해라.

발표 주제 요약: [material.summary]
이전 분석 이력: [마지막 off_topic_log 2건]

응답 형식:
{
  "off_topic": true/false,
  "off_topic_reason": "이탈 이유 (off_topic이 true인 경우)",
  "logic_break": true/false,
  "logic_break_reason": "흐름 단절 이유",
  "ambiguous_phrases": ["감지된 모호 표현 목록"],
  "feedback_message": "사용자에게 보여줄 피드백 문장 (없으면 null)"
}

규칙:
- feedback_message는 20자 이내로 간결하게
- off_topic 판단은 엄격하게 (주제와 완전히 무관한 경우만 true)
- 발화가 너무 짧아 판단 불가 시 모든 값 false 반환"

User: "[최근 30초 누적 발화 텍스트]"
```

#### 호출 제어

```typescript
const SEMANTIC_INTERVAL_MS = 30_000;
const MIN_TRANSCRIPT_LENGTH = 50;  // 글자수 미달 시 호출 스킵

setInterval(async () => {
  const recentText = getRecentTranscript(30_000);
  if (recentText.length < MIN_TRANSCRIPT_LENGTH) return;

  const result = await callSemanticEngine(recentText);
  if (result.feedback_message) {
    const level = result.off_topic ? 'CRITICAL' : 'WARN';
    FeedbackQueue.push({ level, msg: result.feedback_message });
  }

  // off_topic이면 항상 로그 기록 (Agent 4·5 참조용)
  if (result.off_topic) {
    sessionContext.speech_coaching.off_topic_log.push({
      timestamp: Date.now(),
      excerpt: recentText.slice(0, 100),
      reason: result.off_topic_reason
    });
  }
}, SEMANTIC_INTERVAL_MS);
```

---

## Agent 3 — Live Nonverbal Coaching Agent

### 역할

카메라 영상을 분석해 시선 처리, 자세, 제스처를 실시간 감지하고 피드백을 생성합니다. CPU 부하를 Main Thread에서 격리하기 위해 Web Worker에서 실행합니다.

### 실행 환경

```
Main Thread
  ├── 카메라 스트림 (MediaStream) 획득
  ├── ImageBitmap 생성 후 Worker에 transferable로 전달
  └── Worker로부터 분석 결과 수신 → FeedbackQueue에 전달

Web Worker (nonverbal.worker.ts)
  ├── MediaPipe FaceMesh 로드 (시선)
  ├── MediaPipe Pose 로드 (자세)
  └── 5fps 제한으로 분석 수행 → postMessage로 결과 반환
```

### 성능 제어

```typescript
// Main Thread
const FPS_LIMIT = 5;
const FRAME_INTERVAL_MS = 1000 / FPS_LIMIT;  // 200ms

let lastFrameTime = 0;

function onAnimationFrame(timestamp: number) {
  requestAnimationFrame(onAnimationFrame);
  if (timestamp - lastFrameTime < FRAME_INTERVAL_MS) return;
  lastFrameTime = timestamp;

  const bitmap = await createImageBitmap(videoElement);
  worker.postMessage({ type: 'ANALYZE', bitmap }, [bitmap]);  // transferable
}
```

---

### 3-A. 시선 처리 (FaceMesh)

**감지 기준**: 카메라 기준 좌우 ±15도, 상하 ±10도 이내를 "청중 응시"로 판정

```typescript
// Worker 내부
function analyzeGaze(landmarks: NormalizedLandmark[]): GazeResult {
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const noseTip = landmarks[4];

  const gazeOffsetX = Math.abs((leftEye.x + rightEye.x) / 2 - noseTip.x);
  const gazeOffsetY = Math.abs((leftEye.y + rightEye.y) / 2 - noseTip.y);

  const isGazing = gazeOffsetX < 0.15 && gazeOffsetY < 0.10;
  return { isGazing, timestamp: Date.now() };
}

// 10초 슬라이딩 윈도우로 응시율 계산
// 응시율 < 60% → WARN: "청중을 좀 더 바라보세요"
// 응시율 < 40% → CRITICAL: "시선이 카메라에서 많이 벗어났습니다"
```

**피드백 쿨다운**: 30초 (너무 잦은 시선 경고는 오히려 집중 방해)

---

### 3-B. 자세 (Pose)

**감지 기준**: 어깨 양쪽 랜드마크의 y좌표 차이로 기울기 각도 계산

```typescript
function analyzePosture(landmarks: NormalizedLandmark[]): PostureResult {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  const angle = Math.atan2(
    rightShoulder.y - leftShoulder.y,
    rightShoulder.x - leftShoulder.x
  ) * (180 / Math.PI);

  // ±10도 이상이면 기울어짐
  const isStraight = Math.abs(angle) < 10;

  // 상체 거리 (너무 멀거나 가까움)
  const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
  const isTooFar = shoulderWidth < 0.15;    // 뒤로 기댐
  const isTooClose = shoulderWidth > 0.50;  // 카메라에 붙음

  return { isStraight, isTooFar, isTooClose, angle, timestamp: Date.now() };
}

// 피드백
if (!isStraight) → WARN: "자세를 바르게 해주세요"
if (isTooFar)    → INFO: "카메라에 조금 더 가까이 앉으세요"
if (isTooClose)  → INFO: "카메라와 거리를 조금 두세요"
```

---

### 3-C. 제스처 (Hands + Pose)

**과도한 제스처 감지**

```typescript
const GESTURE_MOVE_THRESHOLD = 0.25;  // 화면 너비의 25% 이상 이동
const GESTURE_FREQ_WINDOW_MS = 1_000;
const GESTURE_FREQ_LIMIT = 3;         // 1초 내 3회 이상 → 과도

// 직전 프레임 대비 손목 랜드마크 이동 거리 측정
if (moveDistance > GESTURE_MOVE_THRESHOLD && freqInWindow >= GESTURE_FREQ_LIMIT) {
  FeedbackQueue.push({ level: 'WARN', msg: '제스처가 너무 많아요', cooldown: 60_000 });
}
```

**제스처 부족 감지**

```typescript
const GESTURE_LACK_WINDOW_MS = 5 * 60 * 1_000;  // 5분
const GESTURE_LACK_MOVE_MIN = 0.05;               // 누적 이동 거리 기준

// 5분간 손 이동 누적 거리가 기준치 미만이면
if (cumulativeMove < GESTURE_LACK_MOVE_MIN) {
  FeedbackQueue.push({ level: 'INFO', msg: '제스처로 강조해보세요', cooldown: 120_000 });
}
// 제스처 부족은 INFO 수준 (강요 느낌 방지)
```

---

## Agent 4 — Post-Presentation Q&A Agent

### 역할

발표 종료 후 GPT가 청중 역할을 수행하며 5회 질의응답을 진행합니다. `material.weak_areas`와 `speech_coaching.off_topic_log`를 참조해 발표자의 실제 약점을 집중 공략합니다.

### 질문 전략

| 회차 | 전략 | 난이도 |
|---|---|---|
| 1회 | 발표 내용 기본 이해 확인 | 쉬움 |
| 2회 | 발표 내용 기본 이해 확인 | 쉬움 |
| 3회 | `weak_areas` 기반 취약점 질문 | 중간 |
| 4회 | `off_topic_log` 기반 이탈 부분 재질문 | 중간 |
| 5회 | 가장 날카로운 반박 또는 심화 질문 | 어려움 |

### GPT 프롬프트

**모델**: `gpt-4o`  
**방식**: 매 턴마다 전체 대화 히스토리 포함 (stateless API 극복)

```
System:
"너는 방금 발표를 들은 비판적인 청중이다.

[발표 자료 요약]
{material.summary}

[발표자가 취약한 영역]
{material.weak_areas.join(', ')}

[발표 중 주제를 이탈한 부분]
{off_topic_log.map(e => e.excerpt).join(' / ')}

[규칙]
- 총 5회 질문 후 반드시 종료한다
- 현재 진행 중인 턴: {current_turn} / 5
- 1~2회: 기본 이해 확인 질문 (친절한 톤)
- 3~4회: 취약 영역 집중 질문 (엄격한 톤)
- 5회: 가장 날카로운 반박 또는 '이 발표의 가장 큰 약점이 무엇이라고 생각하나요?' 형태의 심화 질문
- 답변이 불충분하면 한 번만 추가 질문 허용 (전체 5회 한도 내)
- 5회 완료 시 응답 마지막에 [QA_COMPLETE] 태그를 붙여라
- 질문은 두 문장 이내로 간결하게
- 한국어로 응답해라"

User(매 턴): "[사용자 답변]"
```

### 세션 관리

```typescript
interface QaSession {
  turn: number;           // 1~5
  exchanges: QaExchange[];
  isComplete: boolean;
}

// [QA_COMPLETE] 태그 감지 시 Agent 5 트리거
function parseGptResponse(text: string): { message: string; isComplete: boolean } {
  const isComplete = text.includes('[QA_COMPLETE]');
  return {
    message: text.replace('[QA_COMPLETE]', '').trim(),
    isComplete
  };
}
```

### GPT 채점 호출

**모델**: `gpt-4o-mini`  
**실행 시점**: Q&A 5회 완료 직후 1회  

```
System:
"아래 Q&A 전체 내용을 평가해서 JSON으로만 응답해라.

응답 형식:
{
  "final_score": 0~100,
  "per_turn": [
    { "turn": 1, "score": 0~100, "comment": "한 줄 평가" },
    ...
  ],
  "best_answer_turn": 1~5,
  "worst_answer_turn": 1~5,
  "overall_comment": "전체 Q&A 총평 2~3문장"
}"

User: "[전체 QaExchange 배열을 텍스트로 직렬화]"
```

---

## Agent 5 — Report & Analytics Agent

### 역할

세션 전체 데이터를 집계해 종합 점수를 계산하고, GPT로 자연어 피드백을 생성한 뒤 Supabase에 저장합니다.

### 점수 계산

```typescript
function calcCompositeScore(ctx: SessionContext): ReportScores {

  // ── 언어 점수 (40%) ──
  const wpmScore = calcWpmScore(ctx.speech_coaching.wpm_log);
  // WPM이 목표 범위(250~350) 내에 있던 비율 → 0~100

  const fillerScore = Math.max(0, 100 - ctx.speech_coaching.filler_count * 5);
  // 추임새 1개당 5점 감점

  const offTopicScore = Math.max(0, 100 - ctx.speech_coaching.off_topic_log.length * 15);
  // 문맥 이탈 1회당 15점 감점

  const ambiguousScore = Math.max(0, 100 - ctx.speech_coaching.ambiguous_count * 3);
  // 모호 표현 1회당 3점 감점

  const speechScore = Math.round(
    wpmScore * 0.3 + fillerScore * 0.3 + offTopicScore * 0.25 + ambiguousScore * 0.15
  );

  // ── 비언어 점수 (30%) ──
  const gazeScore = Math.round(ctx.nonverbal_coaching.gaze_rate * 100);

  const postureOkCount = ctx.nonverbal_coaching.posture_log.filter(e => e.is_ok).length;
  const postureScore = Math.round(postureOkCount / ctx.nonverbal_coaching.posture_log.length * 100);

  const gestureExcessCount = ctx.nonverbal_coaching.gesture_log.filter(e => e.type === 'excess').length;
  const gestureLackCount = ctx.nonverbal_coaching.gesture_log.filter(e => e.type === 'lack').length;
  const gestureScore = Math.max(0, 100 - gestureExcessCount * 10 - gestureLackCount * 5);

  const nonverbalScore = Math.round(gazeScore * 0.5 + postureScore * 0.3 + gestureScore * 0.2);

  // ── Q&A 점수 (30%) ──
  const qaScore = ctx.qa.final_score;

  // ── 종합 ──
  const compositeScore = Math.round(
    speechScore * 0.4 + nonverbalScore * 0.3 + qaScore * 0.3
  );

  return { compositeScore, speechScore, nonverbalScore, qaScore };
}
```

### GPT 리포트 생성

**모델**: `gpt-4o`  
**실행 시점**: 점수 계산 완료 후 1회  

```
System:
"너는 발표 코치다. 아래 발표 세션 데이터를 분석해서 JSON으로만 응답해라.
추상적인 표현 말고 실제 데이터를 근거로 구체적으로 써라.

[세션 데이터]
- 총 발표 시간: {total_duration_sec}초
- 평균 WPM: {avg_wpm}
- 추임새 횟수: {filler_count}회
- 문맥 이탈 횟수: {off_topic_log.length}회 / 이탈 내용 요약: {off_topic_excerpts}
- 시선 응시율: {gaze_rate * 100}%
- 자세 안정성: {postureScore}점
- Q&A 점수: {qaScore}점 / 취약했던 질문: {worst_answer_turn}번 질문

응답 형식:
{
  "strengths": [
    "잘한 점 1 (구체적 수치 포함)",
    "잘한 점 2",
    "잘한 점 3"
  ],
  "improvements": [
    "개선점 1 (구체적 상황 언급)",
    "개선점 2",
    "개선점 3"
  ]
}"
```

### Supabase 저장

```typescript
async function saveReport(ctx: SessionContext, scores: ReportScores): Promise<void> {
  await supabase.from('sessions').upsert({
    session_id: ctx.session_id,
    user_id: ctx.user_id,
    started_at: ctx.started_at,
    ended_at: ctx.ended_at,
    composite_score: scores.compositeScore,
    status: 'DONE'
  });

  await supabase.from('reports').insert({
    session_id: ctx.session_id,
    speech_score: scores.speechScore,
    nonverbal_score: scores.nonverbalScore,
    qa_score: scores.qaScore,
    composite_score: scores.compositeScore,
    strengths: ctx.report.strengths,
    improvements: ctx.report.improvements,
    generated_at: new Date().toISOString()
  });

  // 로그 테이블은 batch insert로 한 번에
  await supabase.from('speech_logs').insert(
    ctx.speech_coaching.wpm_log.map(e => ({ session_id: ctx.session_id, ...e }))
  );

  await supabase.from('nonverbal_logs').insert(
    [...ctx.nonverbal_coaching.gaze_log, ...ctx.nonverbal_coaching.posture_log]
      .map(e => ({ session_id: ctx.session_id, ...e }))
  );

  await supabase.from('qa_exchanges').insert(
    ctx.qa.exchanges.map(e => ({ session_id: ctx.session_id, ...e }))
  );
}
```

---

## Cross-Agent — FeedbackQueue

모든 에이전트의 피드백이 통과하는 중앙 큐입니다. 동시에 여러 에이전트가 피드백을 발생시켜도 사용자에게는 최대 2개만 표시합니다.

### 피드백 레벨

| Level | 색상 | 예시 | 쿨다운 |
|---|---|---|---|
| CRITICAL | 빨간 배너 | "발표 주제와 완전히 벗어났습니다" | 60초 |
| WARN | 주황 알림 | "말이 너무 빠릅니다" / "추임새가 많아요" | 15초 |
| INFO | 초록 소형 | "제스처로 강조해보세요" / "침묵 감지" | 30초 |

### 구현

```typescript
interface FeedbackItem {
  id: string;
  level: 'CRITICAL' | 'WARN' | 'INFO';
  msg: string;
  source: 'SPEECH_RULE' | 'SPEECH_SEMANTIC' | 'NONVERBAL';
  cooldown: number;       // ms
  createdAt: number;      // timestamp
  silent?: boolean;       // 화면 표시 없이 로그만 기록 (추임새 개별 카운팅 등)
}

class FeedbackQueue {
  private queue: FeedbackItem[] = [];
  private cooldownMap: Map<string, number> = new Map();
  private MAX_DISPLAY = 2;

  push(item: Omit<FeedbackItem, 'id' | 'createdAt'>): void {
    const key = `${item.source}:${item.level}`;

    // 쿨다운 중이면 무시
    const lastTime = this.cooldownMap.get(key) ?? 0;
    if (Date.now() - lastTime < item.cooldown) return;

    this.cooldownMap.set(key, Date.now());
    this.queue.push({ ...item, id: crypto.randomUUID(), createdAt: Date.now() });
    this.flush();
  }

  private flush(): void {
    // 우선순위: CRITICAL > WARN > INFO
    const priority = { CRITICAL: 3, WARN: 2, INFO: 1 };
    const sorted = this.queue
      .filter(i => !i.silent)
      .sort((a, b) => priority[b.level] - priority[a.level]);

    // 상위 MAX_DISPLAY개만 화면에 표시
    this.displayItems = sorted.slice(0, this.MAX_DISPLAY);
  }
}
```

---

## DB 스키마

```sql
-- 사용자 (Supabase Auth와 연동)
CREATE TABLE users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id),
  email       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 세션
CREATE TABLE sessions (
  session_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  started_at       TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ,
  total_duration_sec INTEGER,
  composite_score  SMALLINT,        -- 0~100
  status           TEXT NOT NULL DEFAULT 'IDLE',
  -- status: IDLE | PRE_QUIZ | PRESENTING | POST_QA | REPORT | DONE
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 업로드 파일
CREATE TABLE files (
  file_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id   UUID REFERENCES sessions(session_id),
  storage_path TEXT NOT NULL,       -- Supabase Storage 경로
  filename     TEXT NOT NULL,
  size_bytes   INTEGER,
  summary      TEXT,                -- Agent 1 생성 요약
  keywords     TEXT[],
  uploaded_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 퀴즈
CREATE TABLE quiz_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID REFERENCES sessions(session_id),
  question    TEXT NOT NULL,
  user_answer TEXT,
  score       SMALLINT,
  feedback    TEXT,
  turn        SMALLINT             -- 1~3
);

-- 음성 로그 (WPM · 추임새 · 문맥 이탈)
CREATE TABLE speech_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID REFERENCES sessions(session_id),
  timestamp   BIGINT NOT NULL,     -- Unix ms
  type        TEXT NOT NULL,       -- 'wpm' | 'filler' | 'off_topic' | 'ambiguous'
  value       JSONB                -- { wpm: 320 } or { word: '어' } or { reason: '...' }
);

-- 비언어 로그
CREATE TABLE nonverbal_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID REFERENCES sessions(session_id),
  timestamp   BIGINT NOT NULL,
  type        TEXT NOT NULL,       -- 'gaze' | 'posture' | 'gesture'
  value       JSONB
);

-- Q&A 교환 내역
CREATE TABLE qa_exchanges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID REFERENCES sessions(session_id),
  turn        SMALLINT NOT NULL,   -- 1~5
  question    TEXT NOT NULL,
  answer      TEXT,
  score       SMALLINT,
  comment     TEXT
);

-- 종합 리포트
CREATE TABLE reports (
  session_id       UUID PRIMARY KEY REFERENCES sessions(session_id),
  speech_score     SMALLINT,
  nonverbal_score  SMALLINT,
  qa_score         SMALLINT,
  composite_score  SMALLINT,
  strengths        TEXT[],
  improvements     TEXT[],
  generated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (Row Level Security)
ALTER TABLE sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE files        ENABLE ROW LEVEL SECURITY;
ALTER TABLE speech_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE nonverbal_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports      ENABLE ROW LEVEL SECURITY;

-- 각 테이블: 본인 데이터만 접근 가능
CREATE POLICY "own_data" ON sessions
  USING (user_id = auth.uid());
-- (나머지 테이블도 동일 패턴)
```

---

## 에이전트 간 데이터 흐름

```
[사용자 파일 업로드]
        │
        ▼
┌──────────────┐
│   Agent 1    │  GPT Call 1: 요약 + 키워드 + 퀴즈 생성
│  Material    │  GPT Call 2: 답변 채점
│  & Quiz      │
└──────┬───────┘
       │ material.summary
       │ material.weak_areas         →  Agent 4가 참조
       │
[사용자 발표 시작 클릭]
       │
       ├────────────────────────────────────┐
       ▼                                    ▼
┌──────────────┐                    ┌───────────────┐
│  Agent 2-A   │ 실시간 (0ms)       │   Agent 3     │ 실시간 (5fps)
│  Speech Rule │ WPM · 추임새       │   Nonverbal   │ 시선 · 자세 · 제스처
└──────┬───────┘                    └───────┬───────┘
       │                                    │
       └──────────── FeedbackQueue ─────────┘
                           │
                    화면 오버레이 (최대 2개)
       │
┌──────────────┐
│  Agent 2-B   │ 30초 주기 (GPT-4o-mini)
│ Speech Sem.  │ 문맥 이탈 · 논리 흐름
└──────┬───────┘
       │ off_topic_log                →  Agent 4, 5가 참조
       │
[사용자 발표 종료 클릭]
       │
       ▼
┌──────────────┐
│   Agent 4    │  GPT-4o · 5회 Q&A
│   Q&A        │  weak_areas + off_topic_log 기반 질문
└──────┬───────┘
       │ qa.exchanges · qa.final_score
       │
       ▼
┌──────────────┐
│   Agent 5    │  점수 계산 + GPT 자연어 리포트 생성
│   Report     │  Supabase 저장
└──────┬───────┘
       │
       ▼
  대시보드 히스토리 반영
```

---

## GPT 호출 비용 추정

세션 1회 기준 (발표 10분 가정)

| 호출 | 모델 | 횟수 | 예상 토큰 | 예상 비용 |
|---|---|---|---|---|
| Agent 1: 자료 분석 + 퀴즈 | gpt-4o | 1 | ~4,000 | $0.020 |
| Agent 1: 채점 | gpt-4o-mini | 1 | ~1,500 | $0.001 |
| Agent 2-B: Semantic | gpt-4o-mini | 20회 (10분) | ~800×20 | $0.005 |
| Agent 4: Q&A | gpt-4o | 5~7 | ~2,000×6 | $0.072 |
| Agent 4: 채점 | gpt-4o-mini | 1 | ~2,000 | $0.001 |
| Agent 5: 리포트 | gpt-4o | 1 | ~3,000 | $0.015 |
| **합계** | | | | **~$0.11/세션** |

월 30명 × 세션 3회 = 90세션 → 약 **$10/월** (초기 MVP 테스트 기준)

---

*Point Agent Architecture v1.0 · 2026*
