# Point — Project Guide

AI-powered **presentation coaching platform**. Users practice presentations and receive real-time feedback from a multi-agent system.

**Stack**: React 18 + TypeScript + Vite · Zustand · Tailwind CSS · Supabase (Auth + DB) · OpenAI (GPT-4o) · MediaPipe (vision) · Vercel (deploy + serverless)

---

## Project Structure

```
src/
├── agents/          # Multi-agent coaching system (see below)
├── components/      # React UI components (screens, panels, visualizations)
├── constants/       # Personas (6 coaches), presentation topics
├── hooks/           # Custom React hooks (auth, speech, volume, live session)
├── lib/             # Utility functions & API clients
├── store/           # Zustand stores (session, billing, toast)
├── types/           # TypeScript definitions
├── App.tsx          # Root component — screen router + state machine
└── main.tsx         # React entry point

api/                 # Vercel serverless functions (OpenAI proxy, transcript save)
supabase/            # DB migrations
public/              # Static assets (persona images, video)
```

---

## Agent Architecture

The coaching system is composed of 6 agents, each in `src/agents/agentN-*/`:

| Agent | File | Role |
|-------|------|------|
| **0 — Orchestrator** | `agent0-session-orchestrator/index.ts` | Session lifecycle, state recovery |
| **1 — Material & Quiz** | `agent1-material-quiz/materialQuiz.ts` | GPT-4o: analyzes uploaded files → summary, keywords, 3-question pre-quiz + grading |
| **2-A — Speech Rule** | `agent2-live-speech/rule/speechRule.ts` | 0ms latency: WPM (5s window), filler words, silence detection |
| **2-B — Speech Semantic** | `agent2-live-speech/semantic/speechSemantic.ts` | Every 30s: GPT-4o-mini checks off-topic, logic breaks, ambiguity |
| **3 — Nonverbal** | `agent3-live-nonverbal/nonverbal.worker.ts` | Web Worker + MediaPipe at 5fps: gaze, posture, gestures |
| **4 — Q&A** | `agent4-post-qa/qaAgent.ts` | GPT-4o 5-turn post-presentation Q&A interview |
| **5 — Report** | `agent5-report/reportAgent.ts` | Composite score (40% speech + 30% nonverbal + 30% Q&A) + narrative feedback |

**Shared**: `agents/shared/feedbackQueue.ts` — priority queue (CRITICAL/WARN/INFO) with cooldown, surfaces top 2 feedbacks to UI.

---

## Session State Machine

Implemented in `src/store/sessionStore.ts`, driven by `App.tsx`:

```
IDLE → PRE_QUIZ → PRESENTING → POST_QA → REPORT → DONE
```

All state lives in `SessionContext` (`src/types/session.ts`). Persisted to Supabase after session ends.

---

## Key Screens & Components

| Component | Purpose |
|-----------|---------|
| `App.tsx` | Screen router, mounts/unmounts screens based on session state |
| `LandingScreen.tsx` | Entry page |
| `HomeScreen.tsx` | Coach persona selection |
| `PersonaSurvey.tsx` | Persona match quiz |
| `UploadWorkspace.tsx` / `FileSubmissionPanel.tsx` | Material upload (PDF/TXT) |
| `LiveSessionScreen.tsx` | Main presenting view (camera + real-time coaching) |
| `CoachingGuideStrip.tsx` | Real-time feedback display |
| `QaReportScreen.tsx` | Post-session Q&A + final report |
| `DashboardScreen.tsx` | Session history |
| `ReportPentagonCard.tsx` | Pentagon score visualization |

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/App.tsx` | Screen routing, top-level state |
| `src/store/sessionStore.ts` | Central session state (Zustand) |
| `src/types/session.ts` | All TypeScript types for session, scores, entries |
| `src/lib/openai.ts` | OpenAI client |
| `src/lib/supabase.ts` | Supabase client |
| `src/lib/billing.ts` | Subscription + credit logic |
| `src/hooks/useLivePresenting.ts` | Orchestrates live session (mic, camera, agents) |
| `src/hooks/useAuth.ts` | Supabase Google OAuth |
| `api/openai.ts` | Server-side OpenAI proxy (avoids CORS) |
| `api/save-transcript.ts` | Saves transcript to Vercel Blob |
| `src/constants/personas.ts` | 6 coaching persona definitions |
| `src/constants/personas/*.md` | Detailed persona system prompts |

---

## Coaching Personas (6)

Barack Obama (Orator), Steve Jobs (Visionary), Angela Merkel (Analyst), Oprah Winfrey (Powerhouse), Brené Brown (Connector), Elon Musk

Defined in `src/constants/personas.ts`, system prompts in `src/constants/personas/*.md`.

---

## Environment Variables

```bash
VITE_SUPABASE_URL          # Supabase project URL
VITE_SUPABASE_ANON_KEY     # Supabase public anon key
VITE_OPENAI_API_KEY        # OpenAI API key
BLOB_READ_WRITE_TOKEN      # Vercel Blob token (serverless only)
VITE_OAUTH_REDIRECT_URL    # OAuth callback (optional, defaults to origin)
```

---

## Development

```bash
npm run dev      # Vite dev server → http://localhost:5173
npm run build    # tsc + vite build → dist/
```

Deploy: push to `main` → Vercel auto-deploys. Serverless functions in `api/` deploy automatically.

---

## Detailed Docs

- `point-agents.md` — Full agent architecture spec (975 lines)
- `point-system-uml.md` — UML diagrams
- `docs/BILLING_SETUP.md` — Billing setup
- Each `src/agents/agentN-*/AGENT.md` — Per-agent design doc
