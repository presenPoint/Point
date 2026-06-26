# Point AI Coaching — Session Analytics

> **Point**는 6-agent AI 시스템으로 구동되는 프레젠테이션 코칭 웹 플랫폼입니다.  
> 이 레포지토리는 5명의 유저가 약 10주(32세션)간 사용한 데이터를 분석한 포트폴리오입니다.

---

## 플랫폼 개요

| 구분 | 내용 |
|------|------|
| **스택** | React 18 + TypeScript · Zustand · Supabase · OpenAI GPT-4o · MediaPipe · Vercel |
| **에이전트 수** | 6개 (Orchestrator / Material&Quiz / Speech Rule / Speech Semantic / Nonverbal / Q&A / Report) |
| **수집 지표** | WPM, 필러워드, 침묵, 자세·시선·제스처, 주제이탈, Q&A 답변 품질, 종합 점수 |
| **최종 점수** | speech × 0.4 + nonverbal × 0.3 + Q&A × 0.3 |

### Agent 구성

```
Agent 0  — Orchestrator      세션 생명주기 · 상태 복구
Agent 1  — Material & Quiz   GPT-4o: 자료 분석 → 요약 · 키워드 · 사전퀴즈
Agent 2A — Speech Rule       0ms 레이턴시: WPM(5s window) · 필러워드 · 침묵
Agent 2B — Speech Semantic   GPT-4o-mini: 30s 주기 주제이탈 · 논리오류 감지
Agent 3  — Nonverbal         MediaPipe PoseLandmarker (5fps, Web Worker)
Agent 4  — Q&A               GPT-4o: 5턴 심층 인터뷰
Agent 5  — Report            GPT-4o: 가중합 점수 + 코칭 내러티브
```

---

## 파일 구조

```
analytics/
├── README.md
├── data/
│   └── mock_sessions.json   # 5 users × 5~8 sessions = 32 sessions
├── outputs/                 # 노트북 실행 후 생성되는 차트 이미지
│   ├── session_trends.png
│   ├── correlation_heatmap.png
│   ├── scatter_analysis.png
│   └── user_comparison.png
└── point_analysis.ipynb     # 분석 노트북 (pandas + matplotlib + seaborn)
```

---

## 분석 내용

### 1. 개인별 세션 추이

4가지 핵심 지표(WPM / 필러워드 빈도 / 비언어 점수 / 종합 점수)의 세션별 변화를 유저별로 시각화.

![Session Trends](outputs/session_trends.png)

### 2. 지표간 상관관계

히트맵으로 어떤 지표가 최종 점수와 가장 강하게 연관되는지 분석.  
산점도로 필러워드·침묵·비언어 점수와 최종 점수의 관계를 확인.

![Correlation Heatmap](outputs/correlation_heatmap.png)
![Scatter Analysis](outputs/scatter_analysis.png)

### 3. 유저간 비교

초기 점수 vs 최근 점수, 종합 점수 개선 폭, 필러워드 감소량을 유저별로 비교.

![User Comparison](outputs/user_comparison.png)

---

## 핵심 인사이트

| 발견 | 수치 |
|------|------|
| 필러워드 빈도와 종합 점수 상관계수 | r ≈ −0.9 |
| 10주 평균 종합 점수 향상 | +27.3점 (58.7 → 86.0) |
| WPM 수렴 목표 | ~140 WPM |
| 가장 큰 향상 폭 (Bob Park, 7세션) | +36.8점 |
| David Choi 필러워드 감소 | 36개 → 2개 (-34개) |

---

## 실행 방법

```bash
# 의존성 설치
pip install pandas numpy matplotlib seaborn notebook

# 노트북 실행
cd analytics
jupyter notebook point_analysis.ipynb
```

> Python 3.9+ 권장. 한글 렌더링: Windows는 `Malgun Gothic`, Mac은 `AppleGothic` 자동 적용.

---

## 데이터 구조 (mock_sessions.json)

```json
{
  "session_id": "s001",
  "user_id": "user_1",
  "user_name": "Alice Kim",
  "session_number": 1,
  "session_date": "2025-01-06",
  "duration_min": 5.2,
  "persona_used": "Barack Obama",
  "topic": "AI 기술의 미래",
  "wpm": 142,
  "filler_count": 18,
  "silence_count": 12,
  "posture_score": 63,
  "gaze_score": 59,
  "gesture_score": 61,
  "nonverbal_score": 61.0,
  "off_topic_count": 4,
  "qa_score": 62,
  "speech_score": 58,
  "final_score": 60.2
}
```
