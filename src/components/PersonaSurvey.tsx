import { useState } from 'react';
import { useSessionStore, type PersonaType } from '../store/sessionStore';
import { PERSONAS } from '../constants/personas';

interface Option {
  label: string;
  weights: Partial<Record<PersonaType, number>>;
}

interface Question {
  id: string;
  title: string;
  subtitle: string;
  options: Option[];
}

const QUESTIONS: Question[] = [
  {
    id: 'goal',
    title: 'What is your primary goal for this presentation?',
    subtitle: 'Pick the one that resonates most.',
    options: [
      {
        label: 'Inspire the audience to see a bold new vision',
        weights: { visionary: 3, powerhouse: 1, elon_musk: 1 },
      },
      {
        label: 'Persuade with a compelling, logical narrative',
        weights: { orator: 3, analyst: 1, elon_musk: 1 },
      },
      {
        label: 'Deliver precise data and actionable insights',
        weights: { analyst: 3, orator: 1, elon_musk: 2 },
      },
      {
        label: 'Sell a moonshot or technical thesis — first principles, numbers, stakes',
        weights: { elon_musk: 3, analyst: 2, visionary: 1 },
      },
      {
        label: 'Build trust through authentic personal stories',
        weights: { connector: 3, powerhouse: 1 },
      },
      {
        label: 'Energize the room and leave a lasting impression',
        weights: { powerhouse: 3, visionary: 1 },
      },
    ],
  },
  {
    id: 'style',
    title: 'How would you describe your ideal speaking style?',
    subtitle: 'Think about how you naturally communicate.',
    options: [
      {
        label: 'Minimal words, dramatic pauses, every line lands',
        weights: { visionary: 3, analyst: 1 },
      },
      {
        label: 'Rhythmic and dynamic — building momentum over time',
        weights: { orator: 3, connector: 1 },
      },
      {
        label: 'Conversational and raw — thinking visible, numbers carry the argument',
        weights: { elon_musk: 3, analyst: 1, connector: 1 },
      },
      {
        label: 'Measured and structured — facts first, opinion second',
        weights: { analyst: 3, visionary: 1, elon_musk: 1 },
      },
      {
        label: 'Conversational and warm — like talking to a friend',
        weights: { connector: 3, orator: 1 },
      },
      {
        label: 'Big energy, vocal variety, commanding the stage',
        weights: { powerhouse: 3, connector: 1 },
      },
    ],
  },
  {
    id: 'body',
    title: 'What feels right for your body language?',
    subtitle: 'Imagine yourself on stage right now.',
    options: [
      {
        label: 'Still and composed — let the words do the work',
        weights: { visionary: 2, analyst: 2, elon_musk: 2 },
      },
      {
        label: 'Purposeful hand gestures that punctuate key points',
        weights: { orator: 3, visionary: 1 },
      },
      {
        label: 'Almost no movement — stillness is authority',
        weights: { analyst: 3, elon_musk: 2 },
      },
      {
        label: 'Natural and relaxed — gesturing like in conversation',
        weights: { connector: 3, orator: 1 },
      },
      {
        label: 'Full-body expressiveness — walk, gesture, own the space',
        weights: { powerhouse: 3, connector: 1 },
      },
    ],
  },
];

function calcPersona(answers: Record<string, number>): PersonaType {
  const scores: Record<PersonaType, number> = {
    visionary: 0,
    orator: 0,
    analyst: 0,
    connector: 0,
    powerhouse: 0,
    elon_musk: 0,
  };

  for (const [qId, optIdx] of Object.entries(answers)) {
    const question = QUESTIONS.find((q) => q.id === qId);
    if (!question) continue;
    const option = question.options[optIdx];
    if (!option) continue;
    for (const [persona, weight] of Object.entries(option.weights)) {
      scores[persona as PersonaType] += weight;
    }
  }

  let best: PersonaType = 'orator';
  let max = -1;
  for (const [persona, score] of Object.entries(scores)) {
    if (score > max) {
      max = score;
      best = persona as PersonaType;
    }
  }
  return best;
}

export function PersonaSurvey() {
  const setPersona = useSessionStore((s) => s.setPersona);
  const setAppStarted = useSessionStore((s) => s.setAppStarted);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<PersonaType | null>(null);

  const currentQ = QUESTIONS[step];
  const isLastQuestion = step === QUESTIONS.length - 1;

  const selectOption = (optIdx: number) => {
    const updated = { ...answers, [currentQ.id]: optIdx };
    setAnswers(updated);

    if (isLastQuestion) {
      const persona = calcPersona(updated);
      setResult(persona);
    } else {
      setTimeout(() => setStep((s) => s + 1), 300);
    }
  };

  const handleContinue = () => {
    if (!result) return;
    setPersona(result);
    setAppStarted(true);
  };

  if (result) {
    const p = PERSONAS[result];
    return (
      <main className="survey-screen">
        <div className="survey-card survey-result-card">
          <div className="survey-result-badge">{p.name}</div>
          <h2 className="survey-result-title">Your Coaching Style</h2>
          <p className="survey-result-desc">{p.description}</p>
          <div className="survey-result-config">
            <div className="src-item">
              <svg className="src-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
              </svg>
              <span className="src-label">Target Pace</span>
              <span className="src-value">{p.config.wpmRange[0]}–{p.config.wpmRange[1]} WPM</span>
            </div>
            <div className="src-item">
              <svg className="src-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.05 4.575a1.575 1.575 0 1 0-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 0 1 3.15 0v1.5m-3.15 0 .075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 0 1 3.15 0V15M6.9 7.575a1.575 1.575 0 1 0-3.15 0v8.175a6.75 6.75 0 0 0 6.75 6.75h2.018a5.25 5.25 0 0 0 3.712-1.538l1.732-1.732a5.25 5.25 0 0 0 1.538-3.712l.003-2.024a.668.668 0 0 0-.668-.668a.665.665 0 0 0-.443.18l-.94.94a3.176 3.176 0 0 1-1.124.748M6.9 7.575V12m6.27 4.318A4.49 4.49 0 0 1 16.35 15" />
              </svg>
              <span className="src-label">Gesture Level</span>
              <span className="src-value">{Math.round(p.config.gestureIntensity * 100)}%</span>
            </div>
            <div className="src-item">
              <svg className="src-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.672 48.672 0 0 0 5.232-.556c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
              </svg>
              <span className="src-label">Coaching Tone</span>
              <span className="src-value">{p.config.feedbackTone}</span>
            </div>
          </div>
          <button type="button" className="survey-continue" onClick={handleContinue}>
            Start with {p.name}
            <svg className="survey-continue-arrow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="survey-screen">
      <div className="survey-card">
        <div className="survey-progress">
          {QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={`survey-dot ${i < step ? 'done' : i === step ? 'active' : ''}`}
            />
          ))}
        </div>
        <div className="survey-step-label">
          Question {step + 1} of {QUESTIONS.length}
        </div>
        <h2 className="survey-question">{currentQ.title}</h2>
        <p className="survey-subtitle">{currentQ.subtitle}</p>

        <div className="survey-options">
          {currentQ.options.map((opt, i) => (
            <button
              key={i}
              type="button"
              className={`survey-option ${answers[currentQ.id] === i ? 'selected' : ''}`}
              onClick={() => selectOption(i)}
            >
              <span className="so-indicator">{String.fromCharCode(65 + i)}</span>
              <span className="so-text">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
