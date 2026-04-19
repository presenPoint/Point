# Point — 팀 TODO (2인 개발)

> **프로젝트**: 저장소 루트 (React · Vite · Zustand · Supabase · OpenAI)  
> **참고 문서**: `point-agents.md`, `point-system-uml.md`, `supabase/schema.sql`

아래 항목은 **담당자(A/B)를 팀에서 나눠** 체크박스로 진행 상황을 갱신하면 됩니다.

---

## 0. 협업 기본

- [ ] **저장소·브랜치 규칙**: `main` 보호, 기능 브랜치(`feature/…`) + PR 리뷰 1인 이상
- [ ] **이슈 트래킹**: GitHub Issues / Notion 등 한 곳에 버그·기능 이슈 통일
- [ ] **환경 변수 공유 방식**: `.env`는 공유 금지, `.env.example` + 1Password/팀 보관함 등으로 키만 공유
- [ ] **코드 스타일**: ESLint/Prettier 도입 여부 결정 및 포맷 통일

---

## 1. 인프라 · 배포

- [ ] Supabase 프로젝트 생성 및 `schema.sql` 적용
- [ ] **RLS 정책** 작성·검증 (스키마에 RLS 활성화만 있고 정책이 없다면 `SELECT/INSERT/UPDATE` 규칙 추가)
- [ ] Vercel(또는 팀이 정한 호스팅)에 저장소 배포 파이프라인
- [ ] 프로덕션용 환경 변수 설정 (`VITE_SUPABASE_*`, OpenAI 관련은 아래 보안 항목 참고)

---

## 2. 인증 · 사용자

- [ ] Google OAuth(또는 Supabase Auth) 연동 — 현재 `DEMO_USER` 고정 UUID 대체
- [ ] 로그인/로그아웃 UI 및 세션 만료 처리
- [ ] `users` 테이블과 `auth.users` 트리거(회원가입 시 프로필 행 생성) 정리

---

## 3. 데이터 · 백엔드( Supabase )

- [ ] **`persistSession` 확장**: `sessions` / `reports` 외에 스키마에 있는 `files`, `quiz_items`, `speech_logs`, `nonverbal_logs`, `qa_exchanges` 저장 로직 설계·구현
- [ ] 업로드 파일 **Storage** 버킷 경로 규칙 및 `files` 테이블 연동
- [ ] 세션 단위로 퀴즈·Q&A·로그를 조회할 수 있는 API/쿼리 정리
- [ ] (선택) **Edge Function**으로 OpenAI 프록시 — API 키를 브라우저에 두지 않기

---

## 4. AI · 보안

- [ ] 개발 단계: `.env` + `VITE_OPENAI_API_KEY` 유지 시 **키 노출 위험** 문서화 및 팀 공유
- [ ] 배포 단계: OpenAI 호출을 **서버/Edge**로 이전하고, 클라이언트에는 토큰/세션만 사용
- [ ] GPT 실패 시 사용자 메시지·재시도·폴백 문구 정리 (현재 일부 `null` 폴백)

---

## 5. 프론트엔드 · UX

- [ ] 전 화면 **로딩/에러** 상태 일관성 (`busy`, `error` 표시 패턴 통일)
- [ ] 접근성: 키보드 포커스, 대비, 주요 버튼 라벨
- [ ] 모바일/다양한 뷰포트에서 라이브 발표·카메라 UX 점검
- [ ] (선택) 이전 세션 **히스토리 목록** 및 리포트 재조회

---

## 6. 실시간 코칭(에이전트 2·3)

- [ ] Web Speech / 비언어 Worker 동작 브라우저별 호환성 표 정리 (Chrome 우선 등)
- [ ] `FeedbackQueue`와 UI 토스트/배너 노출 타이밍 실사용 기준 조정
- [ ] MediaPipe 경로: 번들 크기·성능·권한(카메라) UX

---

## 7. 품질 보증

- [ ] 핵심 플로우 E2E 또는 수동 **테스트 시나리오** 문서 (업로드 → 퀴즈 → 라이브 → Q&A → 리포트)
- [ ] (선택) Vitest로 `calcCompositeScore` 등 순수 로직 단위 테스트
- [ ] `npm audit` 취약점 검토 및 업그레이드 계획

---

## 8. 문서

- [ ] 루트 `README.md`에 클론·설치·환경 변수·스크립트·배포 요약
- [ ] (선택) 앱 전용 상세 `README` 보강
- [ ] 본 `TODO.md`와 실제 진행이 어긋나면 주기적으로 항목 수정

---

## 담당 분배 예시 (참고만)

| 영역 | 박유나 | 이원준 |
|------|-------------|-------------|
| Supabase·RLS·Storage·저장 로직 |  | ○ |
| Auth·배포·OpenAI Edge 이전 | ○ |  |
| UI/UX·라이브·접근성 | ○ |  |
| 에이전트·피드백·테스트 시나리오 | | ○ |

팀 상황에 맞게 조정하면 됩니다.

---

*마지막 갱신: 팀에서 직접 날짜를 적어 주세요.*
