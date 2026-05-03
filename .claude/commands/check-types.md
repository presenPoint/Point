Point 프로젝트의 TypeScript 타입 에러를 검사하고 결과를 정리해주세요.

## 실행

```bash
npx tsc --noEmit 2>&1
```

## 결과 처리

### 에러가 없는 경우
"타입 에러 없음 — 빌드 가능 상태입니다." 라고 간단히 알려주세요.

### 에러가 있는 경우
아래 형식으로 정리해주세요:

**에러 목록** (파일별 그룹화):
```
src/foo/bar.ts:12 — TS2345: 에러 메시지 요약
src/foo/bar.ts:34 — TS2304: 에러 메시지 요약
src/baz/qux.ts:5  — TS2339: 에러 메시지 요약
```

**에러 유형 분류**:
- `TS2345` (타입 불일치), `TS2304` (undefined 식별자), `TS2339` (존재하지 않는 프로퍼티) 등 자주 나오는 에러 코드 정리

**수정 제안**:
각 에러에 대해 수정 방법을 구체적으로 제안하세요.

## Point 프로젝트 규칙

타입 수정 시 아래 규칙을 따르세요:
- `any` 사용 금지 — 정확한 타입을 찾거나 `unknown`으로 좁히기
- `SessionContext` 필드 추가 시 `src/types/session.ts` + `sessionStore.ts` 초기값 동시 수정
- `PersonaType` 변경 시 `sessionStore.ts`와 `constants/personas.ts` PERSONAS Record 동기화 확인
- `strict` 모드 활성화 상태 — null check 필수
