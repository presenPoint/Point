# Point — AI Presentation Coach · SKILLS.md

> **이 파일의 목적**: AI agent(Claude 등)가 이 프로젝트를 처음 열었을 때 코드베이스 전체를 빠르게 이해하고 즉시 기여할 수 있도록 설계된 단일 참조 문서입니다. 기능 추가·버그 수정·리팩터링 어떤 작업이든 이 파일을 먼저 읽으십시오.

---

## 1. 프로젝트 개요

**Point**는 실시간 AI 발표 코칭 웹앱입니다. 사용자가 발표 자료를 업로드하면, AI가 발표 중 실시간으로 언어·비언어 피드백을 제공하고, 발표 후 Q&A 시뮬레이션과 종합 리포트를 생성합니다.

| 항목 | 내용 |
|---|---|
| **Stack** | React 18 + TypeScript (strict) + Vite |
| **State** | Zustand (`src/store/sessionStore.ts`) |
| **Backend** | Supabase (Auth + DB) |
| **AI** | OpenAI GPT-4o / GPT-4o-mini |
| **Vision** | MediaPipe FaceMesh / Pose / Hands (Web Worker) |
| **Speech** | Web Speech API (실시간 STT) + Web Audio API (볼륨) |
| **문서 파싱** | pdfjs-dist (PDF), JSZip (PPTX), mammoth (DOCX) |

---

## 2. 6-에이전트 아키텍처

```
사용자
  │
  ├─ [Agent 0] Session Orchestrator  ← 상태 머신 관리 (sessionStore.ts)
  │
  ├─ [Agent 1] Material & Quiz       ← 자료 분석·요약·사전 퀴즈 (PRE_QUIZ 단계)
  │
  ├─ [Agent 2] Live Speech           ← 실시간 언어 코칭 (PRESENTING 단계)
  │     ├─ 2-A Rule Engine          ← 0ms 지연, API 없음 (WPM·추임새·볼륨·침묵)
  │     └─ 2-B Semantic Engine      ← GPT 30초 주기 (문맥 이탈·모호 표현)
  │
  ├─ [Agent 3] Live Nonverbal        ← 실시간 비언어 코칭 (Web Worker, 5fps)
  │     ├─ 시선 (FaceMesh)
  │     ├─ 자세 (Pose)
  │     └─ 제스처 (Hands + Pose)
  │
  ├─ [Agent 4] Post-Q&A              ← 발표 후 AI 질문 시뮬레이션 (POST_QA 단계)
  │
  └─ [Agent 5] Report & Analytics    ← 종합 리포트 + Supabase 저장 (REPORT 단계)
```

각 에이전트의 상세 동작 규격은 해당 폴더의 `AGENT.md`를 참조하십시오.
(`src/agents/agent{N}-*/AGENT.md`)

---

## 3. 세션 상태 머신

```
IDLE → PRE_QUIZ → PRESENTING → POST_QA → REPORT → DONE
```

전환 함수: `useSessionStore.getState().transition(nextStatus)`
구현 위치: `src/store/sessionStore.ts`의 `transition` 액션

---

## 4. 핵심 데이터 구조

### 4-1. SessionContext (`src/types/session.ts`)

모든 에이전트가 읽고 쓰는 단일 공유 상태입니다.

```typescript
SessionContext {
  session_id, user_id, status, started_at, ended_at

  material: {
    raw_text        // 업로드 문서 전체 텍스트
    summary         // Agent 1이 생성한 GPT 요약
    keywords[]      // 키워드 목록
    quiz[]          // 사전 퀴즈 문항 (QuizItem)
    pre_quiz_score  // 0~100
    pre_quiz_grades[]
    weak_areas[]    // Agent 4가 집중 질문에 활용
    script_text     // 선택적 발표 대본 (LiveSession 오버레이용)
  }

  speech_coaching: {
    wpm_log[], filler_count, filler_timestamps[]
    off_topic_log[]         // { timestamp, excerpt, reason, sustained? }
    ambiguous_count
    total_duration_sec
    transcript_log[]
    sustained_off_topic_count
    script_peek_count       // 대본 오버레이 열람 횟수
    volume_log[]            // { timestamp, rms }
    volume_quiet_count
    volume_trailing_count
    volume_monotone_count
  }

  nonverbal_coaching: {
    gaze_rate, gaze_log[]
    posture_log[], gesture_log[], dynamism_log[]
  }

  qa: {
    exchanges[]     // { turn, question, answer, score? }
    final_score, best_answer_turn, worst_answer_turn
  }

  report: {
    composite_score, speech_score, nonverbal_score, qa_score
    strengths[], improvements[]   // ActionableFeedback[]
    persona_style_coaching?       // PersonaStyleCoaching (페르소나 선택 시)
    generated_at
  }
}
```

### 4-2. FeedbackItem (`src/types/session.ts`)

실시간 피드백 아이템의 공통 구조:

```typescript
FeedbackItem {
  id: string          // crypto.randomUUID()
  level: 'CRITICAL' | 'WARN' | 'INFO'
  msg: string
  source: 'SPEECH_RULE' | 'SPEECH_SEMANTIC' | 'NONVERBAL'
  cooldown: number    // ms — 동일 소스 중복 억제
  createdAt: number
  silent?: boolean    // UI 표시 없이 로그만 남김
}
```

---

## 5. FeedbackQueue (`src/agents/shared/feedbackQueue.ts`)

Agent 2·3이 동시에 피드백을 내도 화면 혼란 없이 조율하는 싱글톤 우선순위 큐입니다.

| 정책 | 값 |
|---|---|
| 최대 동시 표시 | 2개 |
| 우선순위 | CRITICAL > WARN > INFO |
| 쿨다운 | 레벨·소스별로 `push` 시 지정 |
| Rule 우선 | 동일 레벨이면 SPEECH_RULE이 SPEECH_SEMANTIC보다 항상 먼저 |

**사용 패턴**:
```typescript
import { feedbackQueue } from '../agents';

feedbackQueue.push({ level: 'WARN', msg: '...', source: 'SPEECH_RULE', cooldown: 15_000 });
const unsub = feedbackQueue.subscribe(() => { /* UI 갱신 */ });
```

---

## 6. 언어 코칭 규칙 (Agent 2-A Rule Engine)

구현 위치: `src/agents/agent2-live-speech/rule/speechRule.ts` + `src/lib/speechUtils.ts`

| 측정값 | 알고리즘 | 기준 | 피드백 수준 |
|---|---|---|---|
| **WPM** | 5초 슬라이딩 윈도우 | 목표 250~350 음절/분 | WARN |
| **추임새** | FILLER_PATTERN 정규식 | 30초 내 3회 이상 | WARN |
| **침묵** | 발화 없는 구간 | 3초 이상 | WARN |
| **볼륨 조용** | 최근 5샘플 평균 < baseline×0.55 | — | WARN (15s cooldown) |
| **문장 끝 하강** | 청크 후반 30% < 전반 50%의 40% | — | WARN (20s cooldown) |
| **단조 음량** | CV(last 30s) < 0.15 | — | WARN (60s cooldown) |
| **불균일 음량** | CV(last 15s) > 0.65 | — | WARN (30s cooldown) |

`FILLER_PATTERN`: `/\b(uh+|um+|er+|ah+|like|you know|basically|actually|so+|well|I mean)\b/gi`

---

## 7. 볼륨 분석 (`src/lib/volumeAnalyzer.ts`)

**설계 원칙**: 절대 dB 기준이 아닌 **세션 내 상대적 변화**로 판단 (마이크 하드웨어·환경 무관).

```
Web Audio API → AnalyserNode → getFloatTimeDomainData()
  → RMS(200ms) → raw sample buffer
  → baseline = median(last 150 samples ≈ 30s)
  → 4가지 패턴 감지 → FeedbackQueue.push()
  → stop() → VolumeStats 반환 → sessionStore에 저장
```

`coefficientOfVariation(arr)` 헬퍼 함수는 `volumeAnalyzer.ts`에서 export —
`reportAgent.ts`의 볼륨 점수 계산에서도 사용.

---

## 8. Semantic 엔진 (`src/agents/agent2-live-speech/semantic/speechSemantic.ts`)

GPT-4o-mini 30초 주기 비동기 호출.

**runSemanticAnalysis 시그니처**:
```typescript
runSemanticAnalysis(
  transcript: string,
  summary: string,
  consecutiveOffTopicCount: number,
  onResult: (r: { offTopic?: OffTopicEntry; ambiguousDelta: number; wasOnTopic: boolean }) => void
): Promise<void>
```

**연속 이탈 감지 (Sustained Off-topic)**:
- `consecutiveOffTopicCount >= 1` → CRITICAL "⚠️ Off-topic too long! Score deducted"
- 단일 이탈 → CRITICAL (GPT 생성 피드백)
- On-topic → WARN for 모호 표현 피드백

---

## 9. 점수 계산 (`src/agents/agent5-report/reportAgent.ts`)

### 9-1. 언어 점수 (40%)

```
speechScore = wpmScore×0.25 + fillerScore×0.25 + offTopicScore×0.20
            + ambiguousScore×0.15 + volumeScore×0.15
            - scriptPenalty
```

- **scriptPenalty** = `max(0, scriptPeeks - 2) × 8`
- **offTopicScore** = `100 - singlePenalty(count×10) - sustainedPenalty(sustainedCount×20)`

### 9-2. 볼륨 점수 (`calcVolumeScore`)

```
CV 이상적 구간 (0.20–0.45) → consistencyScore 100
CV < 0.15 (단조)            → consistencyScore 30–75 선형 보간
CV > 0.65 (불균일)          → consistencyScore 75에서 20으로 하강
eventPenalty = quietCount×5 + trailingCount×8 + monotoneCount×10
volumeScore = consistencyScore×0.6 + max(0, 100-eventPenalty)×0.4
```

### 9-3. 종합 점수

```
compositeScore = speechScore×0.40 + nonverbalScore×0.30 + qaScore×0.30
```

---

## 10. 발표 페르소나 시스템

### 파일 구조

```
src/constants/
  personas.ts                    ← PERSONAS Record + PersonaConfig 타입
  personas/
    elon-musk.md                 ← AI system prompt (raw import)
    steve-jobs-visionary.md
    barack-obama-orator.md
    angela-merkel-analyst.md
    brene-brown-connector.md
    oprah-winfrey-powerhouse.md

src/data/personas/
  elon-musk.md                   ← 학습용 상세 페르소나 (AI agent 주입용)
```

### PersonaType (`src/store/sessionStore.ts`)

```typescript
type PersonaType = 'visionary' | 'orator' | 'analyst' | 'connector' | 'powerhouse' | 'elon_musk';
```

### PersonaConfig 필드

| 필드 | 타입 | 용도 |
|---|---|---|
| `wpmRange` | `[min, max]` | Agent 2 WPM 기준 오버라이드 |
| `gazeSensitivity` | `'high'/'mid'/'low'` | Agent 3 시선 임계값 조정 |
| `gestureIntensity` | `0–1` | Agent 3 제스처 과다 기준 조정 |
| `feedbackTone` | string | Agent 5 리포트 어조 지시 |

### 페르소나 system prompt 주입 위치

`src/agents/agent5-report/reportAgent.ts` → `generateReportNarrative()` 내에서
선택된 페르소나의 `systemPrompt` (md 파일 raw text)를 GPT system 메시지에 삽입.

---

## 11. 주요 컴포넌트 맵

| 컴포넌트 | 역할 |
|---|---|
| `HomeScreen.tsx` | 앱 진입 · 페르소나 선택 · 대시보드 토글 |
| `UploadWorkspace.tsx` | 자료 업로드 + 사전 퀴즈 (PRE_QUIZ 단계) |
| `LiveSessionScreen.tsx` | 실시간 발표 화면 + 스크립트 오버레이 + 메트릭 카드 |
| `QaReportScreen.tsx` | Q&A 대화 + 종합 리포트 표시 |
| `FileSubmissionPanel.tsx` | TXT/MD/PDF/PPTX 다중 파일 업로드 (drag & drop) |
| `ScriptUploadPanel.tsx` | 선택적 대본 업로드 (TXT/MD/PDF/DOCX) 또는 직접 입력 |
| `DashboardScreen.tsx` | 세션 히스토리 + 점수 트렌드 + AI 다음 목표 |
| `PersonaSurvey.tsx` | 페르소나 선택 설문 |
| `PersonaInfoModal.tsx` | 페르소나 상세 정보 모달 |
| `upload/TopicSelector.tsx` | 발표 주제 태그 멀티셀렉터 (검색 포함) |

---

## 12. 주요 Hooks & Libs

| 파일 | 역할 |
|---|---|
| `hooks/useLivePresenting.ts` | 발표 세션 핵심 훅 — Speech API, VolumeAnalyzer, Pose Worker 조율 |
| `hooks/useSpeechToText.ts` | Web Speech API 래퍼 |
| `hooks/useAuth.ts` | Supabase Auth 훅 |
| `hooks/useAppHistorySync.ts` | 브라우저 히스토리 ↔ 앱 상태 동기화 |
| `lib/volumeAnalyzer.ts` | Web Audio API 볼륨 분석 클래스 |
| `lib/extractDocumentText.ts` | PDF(pdfjs) / PPTX(JSZip) / DOCX(mammoth) 텍스트 추출 |
| `lib/processMaterialFile.ts` | 파일 포맷 감지 + extractDocumentText 통합 래퍼 |
| `lib/dashboardAI.ts` | 세션 히스토리 트렌드 분석 + AI Next Focus 추천 |
| `lib/transcriptScript.ts` | 발표 대본 + 실시간 transcript 정합 유틸 |
| `lib/speechUtils.ts` | WPM·필러·볼륨 상수 및 유틸 함수 |
| `utils/presentationTopicSelection.ts` | 토픽 완성도 검증 |
| `utils/topicPromptBuilder.ts` | 선택된 토픽 → GPT 프롬프트 컨텍스트 변환 |

---

## 13. Supabase 스키마 (목표)

```
sessions          session_id, user_id, started_at, ended_at, composite_score, persona_id
speech_logs       session_id, timestamp, type (wpm/filler/off_topic/volume), value
nonverbal_logs    session_id, timestamp, type (gaze/posture/gesture), value
qa_exchanges      session_id, turn, question, answer, score
reports           session_id, scores_json, strengths_json, improvements_json
```

마이그레이션: `supabase/migrations/`

---

## 14. 환경 변수

| 변수 | 용도 |
|---|---|
| `VITE_OPENAI_API_KEY` | GPT 호출 (없으면 Demo 모드) |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |

`src/lib/openai.ts`의 `hasOpenAI()`, `src/lib/supabase.ts`의 `hasSupabase()`로 활성 여부 확인.

---

## 15. 개발 명령어

```bash
npm run dev       # Vite 개발 서버 (localhost:5173)
npm run build     # 프로덕션 빌드
npx tsc --noEmit  # TypeScript 타입 검증만 (빌드 없이)
```

> **주의**: Rollup native binary가 샌드박스 환경에서 누락될 수 있음.
> 타입 검증은 항상 `npx tsc --noEmit`으로 수행할 것.

---

## 16. 코드 기여 규칙

1. **타입 안전**: `strict` 모드 준수. `any` 사용 금지. 변경 후 반드시 `npx tsc --noEmit` 실행.
2. **상태 변경**: 직접 `session` 객체를 mutate하지 말 것. 항상 `useSessionStore.setState` 또는 정의된 액션 사용.
3. **피드백 발행**: FeedbackQueue를 통해서만 발행. 쿨다운 필수 지정.
4. **API 호출**: GPT 호출은 반드시 `hasOpenAI()` 확인 후 진행. 없으면 fallback 반환.
5. **볼륨 분석**: 절대값 기준 사용 금지. 항상 `getBaseline()`(median of last 150 samples) 대비 상대값으로 판단.
6. **새 에이전트 기능 추가 시**: 해당 `AGENT.md`와 `session.ts` 타입, `sessionStore.ts` init값을 함께 업데이트.
7. **페르소나 추가 시**: `constants/personas/` md 파일 → `constants/personas.ts` → `sessionStore.ts`의 `PersonaType` 순서로 추가.

---

## 17. 알려진 제약 사항

| 제약 | 내용 |
|---|---|
| MediaPipe MVP | 현재 `nonverbal.worker.ts`는 실제 FaceMesh/Pose 대신 데모 신호 생성 |
| OCR 미지원 | 스캔 전용 PDF (텍스트 레이어 없음)는 추출 불가 |
| 레거시 PPT | `.ppt` 파일 미지원 — `.pptx`로 변환 후 업로드 필요 |
| 오프라인 | 모든 AI 기능은 네트워크 필요. Demo 모드는 GPT 호출 없이 동작 |
| 브라우저 | Web Speech API는 Chrome 권장. Safari 부분 지원 |
