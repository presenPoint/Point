# Agent 1 — Material & Quiz Agent (자료 학습 + 사전 퀴즈)

## 활성화 시점

파일 업로드(또는 텍스트 입력) 직후, 사용자가 자료 분석을 실행할 때.

## 입력

- PDF(텍스트 레이어)·PPTX(슬라이드·노트)·TXT·MD에서 추출한 **원문 텍스트** (`SessionContext.material.raw_text`). 스캔 전용 PDF는 브라우저 OCR 없음. 레거시 `.ppt`는 클라이언트 미지원 → PPTX로 저장 후 업로드.

## 처리 흐름

### 1. 요약 생성 (GPT-4o)

- 원문을 컨텍스트로 주입 (RAG 없이 context window 활용).
- **출력**: 핵심 요약 3~5문장, 주요 키워드 목록.
- 이 요약은 이후 모든 에이전트가 참조하는 **발표 주제 컨텍스트**가 됩니다.

### 2. 퀴즈 생성 (동일 호출 또는 연속 호출)

- 핵심 질문 **3개**, 단순 암기형 금지.
- **서술형**: "이 내용을 실제로 설명할 수 있는가"를 검증하는 문항.
- 각 문항에 채점용 `key_points`(사용자 비공개) 포함.

### 3. 채점

- 사용자 답변 + 원문/요약·키포인트를 GPT에 전달.
- **출력**: 0~100 숙지도(`total_score`), 문항별 피드백, **`weak_areas` 배열**.
- `weak_areas`는 `session_context`에 저장 → Agent 4(Q&A)가 약점 집중 질문에 사용.

## GPT 시스템 프롬프트 원칙

- **System**: "너는 발표 코치다. 아래 자료를 기반으로만 질문하고 평가해라."
- 자료에 없는 내용으로 질문·평가 금지.
- 응답은 구현에서 정한 **JSON 스키마**만 사용.

## 코드 매핑

- 구현 파일: `materialQuiz.ts` 내 `SYSTEM_ANALYZE`, `SYSTEM_GRADE` 상수와 동기화할 것.

## 출력 스키마 (요약)

```json
{
  "summary": "string",
  "keywords": ["..."],
  "quiz": [{ "id": 1, "question": "...", "key_points": ["..."] }]
}
```

채점 응답:

```json
{
  "total_score": 0,
  "per_question": [{ "id": 1, "score": 0, "feedback": "..." }],
  "weak_areas": ["..."]
}
```
