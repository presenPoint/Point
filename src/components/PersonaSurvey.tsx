import { useState } from 'react';
import { useSessionStore, type PersonaType } from '../store/sessionStore';
import { PERSONAS } from '../constants/personas';
import { PERSONA_FEEDBACK_TONE_KEYS, PERSONA_UI_KEYS } from '../constants/personaUiKeys';
import { useT } from '../hooks/useT';
import { getPersonaPaceRange } from '../lib/speechRate';
import { useEffectiveLocale } from '../hooks/useEffectiveLocale';
import type { MessageKey } from '../locales/messages';
import { navigateBack } from '../lib/appNavigation';
import { LanguageSwitcher } from './LanguageSwitcher';

interface SurveyOptionDef {
  labelKey: MessageKey;
  weights: Partial<Record<PersonaType, number>>;
}

interface SurveyQuestionDef {
  id: string;
  titleKey: MessageKey;
  subtitleKey: MessageKey;
  options: SurveyOptionDef[];
}

const SURVEY_QUESTIONS: SurveyQuestionDef[] = [
  {
    id: 'goal',
    titleKey: 'survey.q1.title',
    subtitleKey: 'survey.q1.subtitle',
    options: [
      { labelKey: 'survey.q1.opt0', weights: { visionary: 3, orator: 1 } },
      { labelKey: 'survey.q1.opt1', weights: { orator: 3, connector: 1 } },
      { labelKey: 'survey.q1.opt2', weights: { connector: 3, visionary: 1 } },
    ],
  },
  {
    id: 'style',
    titleKey: 'survey.q2.title',
    subtitleKey: 'survey.q2.subtitle',
    options: [
      { labelKey: 'survey.q2.opt0', weights: { visionary: 3, orator: 1 } },
      { labelKey: 'survey.q2.opt1', weights: { orator: 3, connector: 1 } },
      { labelKey: 'survey.q2.opt2', weights: { connector: 3, orator: 1 } },
    ],
  },
  {
    id: 'body',
    titleKey: 'survey.q3.title',
    subtitleKey: 'survey.q3.subtitle',
    options: [
      { labelKey: 'survey.q3.opt0', weights: { visionary: 3, orator: 1 } },
      { labelKey: 'survey.q3.opt1', weights: { orator: 3, connector: 1 } },
      { labelKey: 'survey.q3.opt2', weights: { connector: 3, visionary: 1 } },
    ],
  },
];

function calcPersona(answers: Record<string, number>): PersonaType {
  const scores: Record<PersonaType, number> = {
    visionary: 0,
    orator: 0,
    connector: 0,
  };

  for (const [qId, optIdx] of Object.entries(answers)) {
    const question = SURVEY_QUESTIONS.find((q) => q.id === qId);
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
  const t = useT();
  const locale = useEffectiveLocale();
  const setPersona = useSessionStore((s) => s.setPersona);
  const setAppStarted = useSessionStore((s) => s.setAppStarted);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<PersonaType | null>(null);

  const currentQ = SURVEY_QUESTIONS[step];
  const isLastQuestion = step === SURVEY_QUESTIONS.length - 1;

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

  const handleSurveyBack = () => {
    if (result) {
      setResult(null);
      return;
    }
    if (step > 0) {
      setStep((s) => s - 1);
      return;
    }
    navigateBack();
  };

  if (result) {
    const p = PERSONAS[result];
    const ui = PERSONA_UI_KEYS[result];
    const toneKey = PERSONA_FEEDBACK_TONE_KEYS[p.config.feedbackTone] ?? 'persona.feedbackTone.encouraging';
    const displayName = t(ui.name);

    return (
      <main className="survey-screen">
        <div className="survey-card survey-result-card">
          <div className="survey-lang-row">
            <button type="button" className="survey-back-btn" onClick={handleSurveyBack}>
              {t('nav.back')}
            </button>
            <LanguageSwitcher className="lang-switcher--topnav" />
          </div>
          <div className="survey-result-badge">{displayName}</div>
          <h2 className="survey-result-title">{t('survey.result.title')}</h2>
          <p className="survey-result-desc">{t(ui.description)}</p>
          <div className="survey-result-config">
            <div className="src-item">
              <svg className="src-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
              </svg>
              <span className="src-label">{t('survey.result.targetPace')}</span>
              <span className="src-value">
                {(() => {
                  const pace = getPersonaPaceRange(p.config, locale);
                  const unit =
                    pace.unit === 'spm' ? t('persona.modal.spmUnit') : t('persona.modal.wpmUnit');
                  return `${pace.min}–${pace.max} ${unit}`;
                })()}
              </span>
            </div>
            <div className="src-item">
              <svg className="src-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.05 4.575a1.575 1.575 0 1 0-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 0 1 3.15 0v1.5m-3.15 0 .075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 0 1 3.15 0V15M6.9 7.575a1.575 1.575 0 1 0-3.15 0v8.175a6.75 6.75 0 0 0 6.75 6.75h2.018a5.25 5.25 0 0 0 3.712-1.538l1.732-1.732a5.25 5.25 0 0 0 1.538-3.712l.003-2.024a.668.668 0 0 0-.668-.668a.665.665 0 0 0-.443.18l-.94.94a3.176 3.176 0 0 1-1.124.748M6.9 7.575V12m6.27 4.318A4.49 4.49 0 0 1 16.35 15" />
              </svg>
              <span className="src-label">{t('survey.result.gestureLevel')}</span>
              <span className="src-value">{Math.round(p.config.gestureIntensity * 100)}%</span>
            </div>
            <div className="src-item">
              <svg className="src-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.672 48.672 0 0 0 5.232-.556c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
              </svg>
              <span className="src-label">{t('survey.result.coachingTone')}</span>
              <span className="src-value">{t(toneKey)}</span>
            </div>
          </div>
          <button type="button" className="survey-continue" onClick={handleContinue}>
            {t('survey.result.continue', { name: displayName })}
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
        <div className="survey-lang-row">
          <button type="button" className="survey-back-btn" onClick={handleSurveyBack}>
            {t('nav.back')}
          </button>
          <LanguageSwitcher className="lang-switcher--topnav" />
        </div>
        <div className="survey-progress">
          {SURVEY_QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={`survey-dot ${i < step ? 'done' : i === step ? 'active' : ''}`}
            />
          ))}
        </div>
        <div className="survey-step-label">
          {t('survey.stepOf', { n: step + 1, total: SURVEY_QUESTIONS.length })}
        </div>
        <h2 className="survey-question">{t(currentQ.titleKey)}</h2>
        <p className="survey-subtitle">{t(currentQ.subtitleKey)}</p>

        <div className="survey-options">
          {currentQ.options.map((opt, i) => (
            <button
              key={i}
              type="button"
              className={`survey-option ${answers[currentQ.id] === i ? 'selected' : ''}`}
              onClick={() => selectOption(i)}
            >
              <span className="so-indicator">{String.fromCharCode(65 + i)}</span>
              <span className="so-text">{t(opt.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
