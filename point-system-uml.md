# Point — System Architecture UML

> **문서 버전**: v1.0 · 2026  
> **표기 방식**: Mermaid (C4 Model 영감 · 실용 혼합)

---

## 1. 전체 시스템 컨텍스트 (C4 Level 1)

```mermaid
C4Context
  title Point — System Context

  Person(user, "사용자", "대학생 · 직장인\n발표 연습자")

  System(point, "Point Web App", "발표 코칭 플랫폼\nReact + TypeScript\nVercel 배포")

  System_Ext(supabase, "Supabase", "Auth · PostgreSQL DB\n· Storage")
  System_Ext(openai, "OpenAI API", "GPT-4o · GPT-4o-mini\n자료 분석 · Q&A · 채점")
  System_Ext(google, "Google OAuth", "소셜 로그인")

  Rel(user, point, "발표 자료 업로드\n실시간 발표 · Q&A")
  Rel(point, supabase, "사용자·세션·리포트 저장\n파일 스토리지")
  Rel(point, openai, "GPT API 호출\n(퀴즈·채점·Q&A·리포트)")
  Rel(point, google, "OAuth 인증")
  Rel(supabase, google, "Auth 연동")
```

---

## 2. 컨테이너 다이어그램 (C4 Level 2)

```mermaid
C4Container
  title Point — Container Diagram

  Person(user, "사용자")

  Container_Boundary(browser, "브라우저 (Client)") {
    Container(main_thread, "React App\n(Main Thread)", "React · TypeScript · Zustand", "UI 렌더링 · 에이전트 조율\n세션 상태 관리")
    Container(web_worker, "Nonverbal Worker\n(Web Worker)", "TypeScript · MediaPipe", "비언어 분석 독립 실행\nCPU 부하 격리")
    Container(speech_api, "Web Speech API", "Browser Native API", "실시간 음성 → 텍스트 변환")
    Container(media_api, "MediaStream API", "Browser Native API", "카메라 스트림 캡처")
  }

  Container_Boundary(vercel, "Vercel (CDN·Edge)") {
    Container(static, "Static Assets", "HTML · JS · CSS", "빌드 산출물 배포")
  }

  Container_Boundary(supabase_cloud, "Supabase Cloud") {
    ContainerDb(db, "PostgreSQL", "Supabase Postgres", "세션·리포트·로그 저장")
    Container(auth, "Auth Service", "Supabase Auth", "JWT 발급 · Google OAuth")
    ContainerDb(storage, "File Storage", "Supabase Storage", "업로드 PDF·TXT 저장")
  }

  Container_Boundary(openai_cloud, "OpenAI Cloud") {
    Container(gpt4o, "GPT-4o", "OpenAI API", "자료 분석 · Q&A · 리포트")
    Container(gpt4omini, "GPT-4o-mini", "OpenAI API", "채점 · Semantic 코칭 (비용 절감)")
  }

  Rel(user, main_thread, "브라우저 접속 · 인터랙션")
  Rel(main_thread, web_worker, "ImageBitmap 전달\n(Transferable)", "postMessage")
  Rel(web_worker, main_thread, "분석 결과 반환", "postMessage")
  Rel(main_thread, speech_api, "음성 인식 구독")
  Rel(main_thread, media_api, "카메라 스트림 요청")
  Rel(media_api, web_worker, "비디오 프레임 전달")
  Rel(main_thread, auth, "로그인 · JWT 갱신")
  Rel(main_thread, db, "세션·리포트 CRUD", "REST / Realtime")
  Rel(main_thread, storage, "파일 업로드·다운로드")
  Rel(main_thread, gpt4o, "자료 분석 · Q&A · 리포트 호출")
  Rel(main_thread, gpt4omini, "채점 · Semantic 분석 호출")
  Rel(static, main_thread, "JS 번들 로드")
```

---

## 3. 에이전트 컴포넌트 다이어그램 (C4 Level 3)

```mermaid
C4Component
  title Point — Agent Component Diagram

  Container_Boundary(agents, "React App — Agent Layer") {

    Component(orchestrator, "Agent 0\nSession Orchestrator", "Zustand · useEffect", "상태 머신 관리\n에이전트 생명주기 제어\n세션 복구")

    Component(material, "Agent 1\nMaterial & Quiz", "async/await · GPT-4o", "자료 요약 · 퀴즈 생성\n답변 채점 · weak_areas 추출")

    Component(speech_rule, "Agent 2-A\nSpeech Rule Engine", "Web Speech API\n규칙 기반 · 0ms", "WPM 측정\n추임새 감지\n침묵 감지")

    Component(speech_sem, "Agent 2-B\nSpeech Semantic Engine", "GPT-4o-mini\n30초 인터벌", "문맥 이탈 감지\n논리 흐름 체크\n모호 표현 감지")

    Component(nonverbal, "Agent 3\nNonverbal Coaching", "MediaPipe · Web Worker\n5fps 샘플링", "시선 처리 (FaceMesh)\n자세 분석 (Pose)\n제스처 감지 (Hands)")

    Component(qa, "Agent 4\nQ&A Agent", "GPT-4o · 5턴 대화", "청중 역할 Q&A\nweak_areas 기반 질문\n답변 품질 채점")

    Component(report, "Agent 5\nReport & Analytics", "GPT-4o · 점수 계산", "종합 점수 산출\n자연어 피드백 생성\nSupabase 저장")

    Component(feedback_queue, "FeedbackQueue", "우선순위 큐\n쿨다운 관리", "피드백 중재\n최대 2개 동시 표시\nCRITICAL > WARN > INFO")

    Component(session_ctx, "SessionContext", "Zustand Store", "에이전트 간 공유 상태\n모든 에이전트가 읽고 씀")
  }

  Rel(orchestrator, material, "PRE_QUIZ 단계 트리거")
  Rel(orchestrator, speech_rule, "PRESENTING 단계 시작")
  Rel(orchestrator, speech_sem, "PRESENTING 단계 시작")
  Rel(orchestrator, nonverbal, "PRESENTING 단계 시작")
  Rel(orchestrator, qa, "POST_QA 단계 트리거")
  Rel(orchestrator, report, "REPORT 단계 트리거")

  Rel(material, session_ctx, "material 컨텍스트 저장")
  Rel(speech_rule, feedback_queue, "WPM·추임새 피드백 push")
  Rel(speech_sem, feedback_queue, "문맥이탈 피드백 push")
  Rel(speech_sem, session_ctx, "off_topic_log 저장")
  Rel(nonverbal, feedback_queue, "시선·자세·제스처 피드백 push")
  Rel(nonverbal, session_ctx, "nonverbal_log 저장")
  Rel(qa, session_ctx, "weak_areas · off_topic_log 읽기")
  Rel(qa, session_ctx, "qa.exchanges 저장")
  Rel(report, session_ctx, "전체 컨텍스트 읽기")
  Rel(report, session_ctx, "report 저장")
```

---

## 4. 세션 상태 머신

```mermaid
stateDiagram-v2
  direction LR

  [*] --> IDLE : 대시보드 진입

  IDLE --> PRE_QUIZ : 파일 업로드 완료

  state PRE_QUIZ {
    direction TB
    [*] --> 자료분석
    자료분석 --> 퀴즈생성 : GPT-4o 호출
    퀴즈생성 --> 답변수집 : 3문항 표시
    답변수집 --> 채점 : 사용자 제출
    채점 --> [*] : weak_areas 저장
  }

  PRE_QUIZ --> PRESENTING : 발표 시작 클릭

  state PRESENTING {
    direction TB
    [*] --> 언어코칭병렬
    언어코칭병렬 --> 비언어코칭병렬
    note right of 언어코칭병렬
      Agent 2-A (0ms 규칙)
      Agent 2-B (30초 GPT)
      동시 실행
    end note
    note right of 비언어코칭병렬
      Agent 3 Web Worker
      5fps 샘플링
      동시 실행
    end note
  }

  PRESENTING --> POST_QA : 발표 종료 클릭

  state POST_QA {
    direction TB
    [*] --> Q1
    Q1 --> Q2
    Q2 --> Q3
    Q3 --> Q4
    Q4 --> Q5
    Q5 --> 채점완료 : GPT 채점
    채점완료 --> [*]
  }

  POST_QA --> REPORT : Q&A 5회 완료

  state REPORT {
    direction TB
    [*] --> 점수계산
    점수계산 --> 자연어생성 : GPT-4o 호출
    자연어생성 --> DB저장 : Supabase upsert
    DB저장 --> [*]
  }

  REPORT --> DONE : 리포트 저장 완료
  DONE --> [*]

  PRESENTING --> IDLE : 강제 종료 (beforeunload 저장)
```

---

## 5. 실시간 발표 중 데이터 흐름 시퀀스

```mermaid
sequenceDiagram
  autonumber
  actor User as 사용자
  participant WebSpeech as Web Speech API
  participant RuleEngine as Agent 2-A<br>Rule Engine
  participant SemanticEngine as Agent 2-B<br>Semantic Engine
  participant Worker as Agent 3<br>Web Worker
  participant Camera as MediaStream
  participant FQ as FeedbackQueue
  participant UI as 오버레이 UI
  participant GPT as GPT-4o-mini
  participant Ctx as SessionContext

  User ->> WebSpeech: 발표 시작 (마이크 활성화)
  User ->> Camera: 카메라 스트림 시작

  loop 발화 청크마다 (실시간)
    WebSpeech ->> RuleEngine: onresult (텍스트 청크)
    RuleEngine ->> RuleEngine: WPM 계산 (5초 윈도우)
    RuleEngine ->> RuleEngine: 추임새 감지 (정규식)
    RuleEngine ->> FQ: 피드백 push (WARN/INFO)
    FQ ->> UI: 우선순위 상위 2개 표시
  end

  loop 30초마다 (비동기)
    SemanticEngine ->> SemanticEngine: 누적 발화 텍스트 수집
    SemanticEngine ->> GPT: 문맥 이탈 · 논리 흐름 분석 요청
    GPT -->> SemanticEngine: { off_topic, feedback_message }
    SemanticEngine ->> Ctx: off_topic_log 저장
    SemanticEngine ->> FQ: 피드백 push (CRITICAL/WARN)
    FQ ->> UI: 우선순위 상위 2개 표시
  end

  loop 5fps (Web Worker)
    Camera ->> Worker: ImageBitmap 전달 (transferable)
    Worker ->> Worker: FaceMesh → 시선 분석
    Worker ->> Worker: Pose → 자세 분석
    Worker ->> Worker: Hands → 제스처 분석
    Worker -->> FQ: postMessage (결과)
    FQ ->> UI: 우선순위 상위 2개 표시
  end

  loop 30초마다
    RuleEngine ->> Ctx: wpm_log, filler_count 저장
    Worker -->> Ctx: gaze_log, posture_log 저장
  end
```

---

## 6. Q&A 세션 시퀀스

```mermaid
sequenceDiagram
  autonumber
  actor User as 사용자
  participant QA as Agent 4<br>Q&A Agent
  participant GPT4o as GPT-4o
  participant GPTmini as GPT-4o-mini
  participant Ctx as SessionContext
  participant Report as Agent 5<br>Report Agent
  participant DB as Supabase

  User ->> QA: Q&A 시작 클릭
  QA ->> Ctx: weak_areas, off_topic_log 읽기

  loop Turn 1~5
    QA ->> GPT4o: System(역할·컨텍스트) +<br>전체 대화 히스토리 + 사용자 답변
    GPT4o -->> QA: 다음 질문 생성
    QA ->> User: 질문 표시
    User ->> QA: 답변 입력
    QA ->> Ctx: exchange 저장 (turn, question, answer)

    alt Turn 5 완료
      GPT4o -->> QA: 응답 + [QA_COMPLETE] 태그
      QA ->> QA: Q&A 종료 트리거
    end
  end

  QA ->> GPTmini: 전체 exchanges 채점 요청
  GPTmini -->> QA: { final_score, per_turn[], best/worst_turn }
  QA ->> Ctx: qa.final_score 저장

  QA ->> Report: Agent 5 트리거

  Report ->> Ctx: 전체 SessionContext 읽기
  Report ->> Report: 종합 점수 계산<br>(언어40% · 비언어30% · Q&A30%)
  Report ->> GPT4o: 수치 데이터 → 자연어 피드백 생성 요청
  GPT4o -->> Report: { strengths[], improvements[] }
  Report ->> Ctx: report 저장
  Report ->> DB: sessions upsert
  Report ->> DB: reports insert
  Report ->> DB: speech_logs batch insert
  Report ->> DB: nonverbal_logs batch insert
  Report ->> DB: qa_exchanges batch insert
  Report ->> User: 리포트 화면 표시
```

---

## 7. 인증 플로우

```mermaid
sequenceDiagram
  autonumber
  actor User as 사용자
  participant App as React App
  participant SupaAuth as Supabase Auth
  participant Google as Google OAuth

  alt Google 로그인
    User ->> App: Google 로그인 버튼 클릭
    App ->> SupaAuth: signInWithOAuth({ provider: 'google' })
    SupaAuth ->> Google: OAuth 리디렉션
    Google -->> User: 계정 선택 화면
    User ->> Google: 계정 선택
    Google -->> SupaAuth: Authorization Code
    SupaAuth -->> App: JWT (access_token + refresh_token)
    App ->> App: 대시보드 라우팅
  else 이메일 로그인
    User ->> App: 이메일 · 비밀번호 입력
    App ->> SupaAuth: signInWithPassword({ email, password })
    SupaAuth -->> App: JWT
    App ->> App: 대시보드 라우팅
  else 토큰 만료
    App ->> SupaAuth: 자동 토큰 갱신 (onAuthStateChange)
    SupaAuth -->> App: 새 access_token
  end
```

---

## 8. DB 엔티티 관계도 (ERD)

```mermaid
erDiagram
  USERS {
    uuid    id          PK
    text    email
    timestamp created_at
  }

  SESSIONS {
    uuid      session_id        PK
    uuid      user_id           FK
    timestamp started_at
    timestamp ended_at
    int       total_duration_sec
    smallint  composite_score
    text      status
    timestamp created_at
  }

  FILES {
    uuid      file_id       PK
    uuid      user_id       FK
    uuid      session_id    FK
    text      storage_path
    text      filename
    int       size_bytes
    text      summary
    text[]    keywords
    timestamp uploaded_at
  }

  QUIZ_ITEMS {
    uuid      id          PK
    uuid      session_id  FK
    text      question
    text      user_answer
    smallint  score
    text      feedback
    smallint  turn
  }

  SPEECH_LOGS {
    uuid    id          PK
    uuid    session_id  FK
    bigint  timestamp
    text    type
    jsonb   value
  }

  NONVERBAL_LOGS {
    uuid    id          PK
    uuid    session_id  FK
    bigint  timestamp
    text    type
    jsonb   value
  }

  QA_EXCHANGES {
    uuid      id          PK
    uuid      session_id  FK
    smallint  turn
    text      question
    text      answer
    smallint  score
    text      comment
  }

  REPORTS {
    uuid      session_id      PK FK
    smallint  speech_score
    smallint  nonverbal_score
    smallint  qa_score
    smallint  composite_score
    text[]    strengths
    text[]    improvements
    timestamp generated_at
  }

  USERS         ||--o{ SESSIONS      : "has"
  USERS         ||--o{ FILES         : "uploads"
  SESSIONS      ||--o{ FILES         : "uses"
  SESSIONS      ||--o{ QUIZ_ITEMS    : "contains"
  SESSIONS      ||--o{ SPEECH_LOGS   : "records"
  SESSIONS      ||--o{ NONVERBAL_LOGS: "records"
  SESSIONS      ||--o{ QA_EXCHANGES  : "contains"
  SESSIONS      ||--|| REPORTS       : "produces"
```

---

## 9. FeedbackQueue 우선순위 처리 흐름

```mermaid
flowchart TD
  A([Agent 2-A\nRule Engine]) -->|피드백 이벤트| FQ
  B([Agent 2-B\nSemantic Engine]) -->|피드백 이벤트| FQ
  C([Agent 3\nNonverbal Worker]) -->|postMessage| FQ

  FQ{FeedbackQueue}

  FQ --> CD{쿨다운\n체크}
  CD -->|쿨다운 중| DROP[❌ 드롭]
  CD -->|쿨다운 종료| PQ[우선순위 큐에 추가]

  PQ --> SORT[CRITICAL · WARN · INFO\n우선순위 정렬]
  SORT --> SLICE[상위 2개 선택]

  SLICE --> UI1[오버레이 슬롯 1]
  SLICE --> UI2[오버레이 슬롯 2]

  UI1 --> TTL[자동 사라짐\n5~8초 후]
  UI2 --> TTL

  subgraph 레벨별 색상
    CR[🔴 CRITICAL\n빨간 배너\n쿨다운 60초]
    WN[🟠 WARN\n주황 알림\n쿨다운 15초]
    IN[🟢 INFO\n초록 소형\n쿨다운 30초]
  end
```

---

## 10. 기술 스택 레이어 다이어그램

```mermaid
block-beta
  columns 3

  block:presentation:3
    P["🖥️ Presentation Layer\nReact · Tailwind CSS · Zustand\n오버레이 UI · 대시보드 · 리포트 화면"]
  end

  block:agent:3
    A0["Agent 0\nOrchestrator\n상태 머신"] 
    A12["Agent 1 · 2\nMaterial · Speech\nGPT + Web Speech"]
    A345["Agent 3 · 4 · 5\nNonverbal · Q&A · Report\nWorker + GPT"]
  end

  block:infra:3
    I1["🔐 Supabase Auth\nGoogle OAuth\nJWT 관리"]
    I2["🗄️ Supabase DB\nPostgreSQL\nRLS 적용"]
    I3["📦 Supabase Storage\nPDF · TXT\n파일 저장"]
  end

  block:external:3
    E1["🤖 GPT-4o\n자료분석 · Q&A\n리포트 생성"]
    E2["🤖 GPT-4o-mini\n채점 · Semantic\n비용 절감"]
    E3["☁️ Vercel\nCDN 배포\nEdge Network"]
  end

  presentation --> agent
  agent --> infra
  agent --> external
```

---

*Point System Architecture UML v1.0 · 2026*
