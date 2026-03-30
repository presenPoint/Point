import { useCallback, useRef, useState } from 'react';
import { hasOpenAI } from '../lib/openai';
import { hasSupabase } from '../lib/supabase';
import { useSessionStore } from '../store/sessionStore';

function StepBar({ activeStep }: { activeStep: 1 | 2 | 3 | 4 }) {
  const dot = (n: number) => {
    if (n < activeStep) return 'step-dot done';
    if (n === activeStep) return 'step-dot active';
    return 'step-dot';
  };
  const label = (n: number) => (n < activeStep ? '✓' : String(n));
  return (
    <div className="topbar-steps">
      <div className={dot(1)}>{label(1)}</div>
      <div className="step-line" />
      <div className={dot(2)}>{label(2)}</div>
      <div className="step-line" />
      <div className={dot(3)}>{label(3)}</div>
      <div className="step-line" />
      <div className={dot(4)}>{label(4)}</div>
    </div>
  );
}

export function UploadWorkspace() {
  const session = useSessionStore((s) => s.session);
  const busy = useSessionStore((s) => s.busy);
  const error = useSessionStore((s) => s.error);
  const preQuizAnswers = useSessionStore((s) => s.preQuizAnswers);
  const presentationTopic = useSessionStore((s) => s.presentationTopic);
  const setPresentationTopic = useSessionStore((s) => s.setPresentationTopic);
  const setAppStarted = useSessionStore((s) => s.setAppStarted);
  const setPreQuizAnswer = useSessionStore((s) => s.setPreQuizAnswer);
  const setMaterialText = useSessionStore((s) => s.setMaterialText);
  const runMaterialAnalysis = useSessionStore((s) => s.runMaterialAnalysis);
  const submitPreQuiz = useSessionStore((s) => s.submitPreQuiz);
  const transition = useSessionStore((s) => s.transition);

  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const activeStep: 1 | 2 | 3 | 4 = session.status === 'PRE_QUIZ' ? 2 : 1;

  const onFile = useCallback(
    (file: File) => {
      if (!file.name.match(/\.(txt|md)$/i)) {
        useSessionStore.setState({ error: 'TXT 또는 MD 파일만 지원합니다 (MVP).' });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const t = String(reader.result ?? '');
        setMaterialText(t);
        useSessionStore.setState({ error: null });
      };
      reader.readAsText(file, 'UTF-8');
    },
    [setMaterialText]
  );

  const dropZoneClass = dragOver ? 'drop-zone dragover' : 'drop-zone';

  return (
    <div id="screen-upload" className="point-screen">
      <div className="app-shell">
        <div className="topbar">
          <div className="topbar-logo">Point</div>
          <StepBar activeStep={activeStep} />
          <div className="topbar-right">
            <button type="button" className="btn-sm" onClick={() => setAppStarted(false)}>
              ← 홈
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={session.material.pre_quiz_score <= 0 || !!busy}
              onClick={() => transition('PRESENTING')}
            >
              발표 시작 →
            </button>
          </div>
        </div>

        <div className="upload-area">
          <div className="upload-main">
            <h2>발표 자료를 업로드하세요</h2>
            <p>
              AI가 발표 내용을 학습해 사전 질문과 발표 후 질의응답을 준비합니다.
              <br />
              MVP에서는 텍스트 파일 또는 아래 입력란에 직접 붙여넣기를 지원합니다.
            </p>

            <label className="input-label">발표 주제</label>
            <input
              type="text"
              className="topic-input"
              placeholder="예: 기후변화와 탄소중립 정책의 현황 및 과제"
              value={presentationTopic}
              onChange={(e) => setPresentationTopic(e.target.value)}
            />

            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,text/plain"
              className="hidden"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = '';
              }}
            />

            <div
              role="button"
              tabIndex={0}
              className={dropZoneClass}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) onFile(f);
              }}
            >
              <div className="drop-icon">📂</div>
              <div className="drop-text">파일을 드래그하거나 클릭해 업로드</div>
              <div className="drop-sub">TXT · MD (직접 입력은 아래)</div>
            </div>

            <label className="input-label">발표 원문 (텍스트)</label>
            <textarea
              className="topic-input"
              style={{ minHeight: 160, resize: 'vertical' }}
              placeholder="여기에 자료 전문을 붙여넣거나, 위에서 파일을 선택하세요."
              value={session.material.raw_text}
              onChange={(e) => setMaterialText(e.target.value)}
            />

            {error && (
              <div
                style={{
                  marginBottom: 16,
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid rgba(255,79,106,0.35)',
                  background: 'var(--red-dim)',
                  color: 'var(--red)',
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="button"
              className="btn-primary"
              style={{ padding: '12px 24px', fontSize: 14, marginBottom: 24 }}
              disabled={!!busy}
              onClick={() => void runMaterialAnalysis()}
            >
              {busy === '자료 분석 중…' ? busy : 'AI 분석 · 퀴즈 생성'}
            </button>

            {session.status === 'PRE_QUIZ' && session.material.summary && (
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 18,
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 9,
                    letterSpacing: '0.15em',
                    color: 'var(--violet)',
                    marginBottom: 10,
                  }}
                >
                  🤖 AI ANALYSIS COMPLETE
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted2)', lineHeight: 1.7 }}>
                  키워드 <strong style={{ color: 'var(--text)' }}>{session.material.keywords.length}개</strong>{' '}
                  추출 · 사전 퀴즈 <strong style={{ color: 'var(--text)' }}>3문항</strong> 생성
                  <br />
                  OpenAI: {hasOpenAI() ? '연결됨' : '데모'} · Supabase: {hasSupabase() ? '설정됨' : '로컬'}
                </div>
              </div>
            )}
          </div>

          <div className="quiz-panel">
            <div className="quiz-header">
              <div className="quiz-badge">📋 PRE-PRESENTATION CHECK</div>
              <div className="quiz-title">내용 숙지 확인</div>
              <div className="quiz-sub">
                발표 전, AI가 핵심 내용을 질문합니다. 답변하면서 발표 준비도를 점검하세요.
              </div>
            </div>

            {session.status === 'PRE_QUIZ' && session.material.quiz.length > 0 ? (
              session.material.quiz.map((q, idx) => {
                const answered = Boolean(preQuizAnswers[q.id]?.trim());
                return (
                  <div key={q.id} className={`quiz-card ${answered ? 'answered' : ''}`}>
                    <div className="qc-num">
                      Q {String(idx + 1).padStart(2, '0')} / 03
                    </div>
                    <div className="qc-question">{q.question}</div>
                    <textarea
                      className="qc-textarea"
                      placeholder="답변을 입력하세요..."
                      value={preQuizAnswers[q.id] ?? ''}
                      onChange={(e) => setPreQuizAnswer(q.id, e.target.value)}
                    />
                  </div>
                );
              })
            ) : (
              <p style={{ color: 'var(--muted2)', fontSize: 13, lineHeight: 1.6 }}>
                왼쪽에서 자료를 분석하면 퀴즈가 표시됩니다.
              </p>
            )}

            {session.status === 'PRE_QUIZ' && session.material.quiz.length > 0 && (
              <div className="qc-footer" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                <button
                  type="button"
                  className="btn-submit-q"
                  disabled={!!busy}
                  onClick={() => void submitPreQuiz()}
                >
                  전체 제출 · 채점 →
                </button>
              </div>
            )}

            {session.material.pre_quiz_score > 0 && (
              <div className="quiz-score" style={{ display: 'block', marginTop: 16 }}>
                <div className="qs-label">내용 숙지도 점수</div>
                <div className="qs-score">
                  {session.material.pre_quiz_score}
                  <span style={{ fontSize: 18, opacity: 0.6 }}>점</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 6 }}>
                  상단의 「발표 시작」으로 라이브 세션에 들어가세요.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
