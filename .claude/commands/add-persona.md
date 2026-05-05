사용자가 새 발표 페르소나를 Point 앱에 추가할 수 있도록 단계별로 안내하세요.

## 컨텍스트

Point 앱의 페르소나 시스템은 아래 파일들로 구성됩니다:
- `src/constants/personas.ts` — `Persona` 타입 정의 + `PERSONAS` Record (전체 목록)
- `src/constants/personas/<id>.md` — GPT system prompt (Vite `?raw` import)
- `src/store/sessionStore.ts` — `PersonaType` union 타입
- `public/personas/<id>.png` — 홈 카드 포트레이트 이미지

현재 페르소나: `visionary` (Steve Jobs), `orator` (Barack Obama), `connector` (Brené Brown)

## 절차

### Step 1 — 페르소나 정보 수집

사용자에게 다음을 물어보세요 (한 번에 물어볼 것):
1. **id** — 영소문자 snake_case (예: `ted_talker`)
2. **name** — 실제 인물명 또는 아키타입명
3. **description** — 한 문장 스타일 요약 (홈 카드에 표시)
4. **wpmRange** — `[최소, 최대]` 음절/분 (예: `[130, 170]`)
5. **gazeSensitivity** — `'high'` | `'mid'` | `'low'`
6. **gestureIntensity** — 0.0 ~ 1.0
7. **feedbackTone** — `'sharp'` | `'encouraging'` | `'precise'` | `'warm'` | `'empowering'`
8. **archetype** — 아키타입 레이블 (예: "The Data Storyteller")
9. **domainFit** — 적합한 발표 상황
10. **principles** — 핵심 원칙 3~5개 (배열)
11. **카드 이미지 경로** — 이미지가 이미 있으면 경로, 없으면 placeholder 사용

### Step 2 — 파일 생성/수정

수집한 정보를 바탕으로 아래를 **순서대로** 실행하세요:

#### 2-1. `src/constants/personas/<id>.md` 생성
GPT system prompt 파일. 다음 구조를 따르세요:
```
You are coaching a presenter to speak in the style of <Name>.

Core speaking style:
- <bullet 1>
- <bullet 2>
...

When giving feedback:
- Tone: <feedbackTone 설명>
- Focus on: <핵심 강조점>
```

#### 2-2. `src/constants/personas.ts` 수정
1. 상단에 import 추가:
   ```typescript
   import <id>Prompt from './personas/<id>.md?raw';
   ```
2. `PERSONAS` Record에 새 항목 추가 (기존 패턴 참고):
   ```typescript
   <id>: {
     id: '<id>',
     name: '...',
     description: '...',
     config: { wpmRange: [...], gazeSensitivity: '...', gestureIntensity: 0.0, feedbackTone: '...' },
     systemPrompt: <id>Prompt,
     cardImage: '/personas/<id>.png',
     presentationInfo: {
       archetype: '...',
       domainFit: '...',
       summary: '...',
       principles: ['...', '...'],
     },
   },
   ```

#### 2-3. `src/store/sessionStore.ts` 수정
`PersonaType` union에 새 id 추가:
```typescript
type PersonaType = 'visionary' | 'orator' | 'connector' | '<id>';
```

#### 2-4. 이미지 안내
- 이미지 파일이 없으면: `public/personas/<id>.png` 경로에 넣어달라고 사용자에게 안내
- 없으면 기존 이미지 중 하나를 임시로 cardImage에 지정

### Step 3 — 타입 검증

모든 파일 수정 후 반드시 실행:
```bash
npx tsc --noEmit
```
에러가 있으면 수정 후 다시 확인.

### Step 4 — 결과 요약

완료 후 사용자에게 알려줄 것:
- 추가된 파일 목록
- 수정된 파일 목록
- 이미지 파일 배치 필요 여부
- 타입 검증 결과
