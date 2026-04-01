import { hasOpenAI } from '../lib/openai';
import { hasSupabase } from '../lib/supabase';
import { useSessionStore } from '../store/sessionStore';
import { PRE_QUIZ_PASS_SCORE } from '../types/session';
import { FileSubmissionPanel } from './FileSubmissionPanel';

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
  const runMaterialAnalysis = useSessionStore((s) => s.runMaterialAnalysis);
  const submitPreQuiz = useSessionStore((s) => s.submitPreQuiz);
  const transition = useSessionStore((s) => s.transition);

  const activeStep: 1 | 2 | 3 | 4 = session.status === 'PRE_QUIZ' ? 2 : 1;

  const canStartPresenting =
    session.status === 'PRE_QUIZ' &&
    Boolean(session.material.summary?.trim()) &&
    !busy;

  const isPreQuizGrading = busy === '채점 중…';

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
              disabled={!canStartPresenting}
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
              AI가 업로드한 자료를 분석해 요약·키워드를 만들고, 내용 숙지 확인용 서술형 퀴즈(Agent 1)를 냅니다.
              <br />
              발표 후 Q&A(Agent 4)는 이 요약과 사전 퀴즈에서 드러난 약점을 반영하고, 세션 종료 시 리포트(Agent 5)에 반영됩니다.
              <br />
              <span style={{ color: 'var(--muted)' }}>파일을 추가한 뒤 「저장」으로 세션에 반영한 다음, 「AI 분석 · 퀴즈 생성」을 누르세요.</span>
            </p>

            <label className="input-label">발표 주제</label>
            <input
              type="text"
              className="topic-input"
              placeholder="예: 기후변화와 탄소중립 정책의 현황 및 과제"
              value={presentationTopic}
              onChange={(e) => setPresentationTopic(e.target.value)}
            />

            <FileSubmissionPanel globalBusy={!!busy} />

            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}

            <button
              type="button"
              className="btn-primary btn-analyze"
              disabled={!!busy}
              onClick={() => void runMaterialAnalysis()}
            >
              {busy === '자료 분석 중…' ? busy : 'AI 분석 · 퀴즈 생성'}
            </button>

            {session.status === 'PRE_QUIZ' && session.material.summary && (
              <div className="analysis-complete-card">
                <div className="analysis-badge" aria-label="분석 완료">
                  🤖 AI ANALYSIS COMPLETE
                </div>
                <div className="analysis-detail">
                  키워드 <strong>{session.material.keywords.length}개</strong>{' '}
                  추출 · 사전 퀴즈 <strong>3문항</strong> 생성
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
                <br />
                전체 제출 후 문항별로 맞음·틀림(70점 기준)과 피드백이 표시됩니다. 퀴즈는 선택 사항이며, 채점 없이도 상단 「발표 시작」으로 진행할 수 있습니다.
              </div>
            </div>

            {isPreQuizGrading && (
              <div className="quiz-grading-overlay" role="status" aria-live="polite" aria-busy="true">
                <div className="quiz-grading-card">
                  <div className="quiz-grading-spinner" aria-hidden />
                  <p className="quiz-grading-title">채점 중입니다</p>
                  <p className="quiz-grading-sub">AI가 답변을 평가하고 있습니다. 잠시만 기다려 주세요.</p>
                </div>
              </div>
            )}

            {session.status === 'PRE_QUIZ' && session.material.quiz.length > 0 ? (
              session.material.quiz.map((q, idx) => {
                const answered = Boolean(preQuizAnswers[q.id]?.trim());
                const gradeRow = session.material.pre_quiz_grades.find((g) => g.id === q.id);
                const passed = gradeRow != null && gradeRow.score >= PRE_QUIZ_PASS_SCORE;
                const gradedCls =
                  gradeRow != null ? (passed ? 'qc-graded-pass' : 'qc-graded-fail') : '';
                return (
                  <div
                    key={q.id}
                    className={`quiz-card ${answered ? 'answered' : ''} ${gradedCls}`.trim()}
                  >
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
                    {gradeRow != null && (
                      <div className={`qc-grade ${passed ? 'qc-grade-pass' : 'qc-grade-fail'}`}>
                        <div className="qc-grade-head">
                          <strong>{passed ? '맞음' : '틀림'}</strong>
                          <span className="qc-grade-score">{gradeRow.score}점</span>
                        </div>
                        <p className="qc-grade-feedback">{gradeRow.feedback}</p>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="quiz-empty-hint">
                왼쪽에서 자료를 분석하면 퀴즈가 표시됩니다.
              </p>
            )}

            {session.status === 'PRE_QUIZ' && session.material.quiz.length > 0 && (
              <div className="qc-footer qc-footer-left">
                <button
                  type="button"
                  className="btn-submit-q"
                  disabled={!!busy}
                  onClick={() => void submitPreQuiz()}
                >
                  {isPreQuizGrading ? '채점 중…' : '전체 제출 · 채점 →'}
                </button>
              </div>
            )}

            {session.material.pre_quiz_score > 0 && (
              <div className="quiz-score quiz-score-visible">
                <div className="qs-label">내용 숙지도 점수</div>
                <div className="qs-score">
                  {session.material.pre_quiz_score}
                  <span className="score-unit">점</span>
                </div>
                <div className="score-guide">
                  상단의 「발표 시작」으로 라이브 세션에 들어가세요.
                </div>
              </div>
            )}

            {session.status === 'PRE_QUIZ' &&
              session.material.summary &&
              session.material.pre_quiz_score <= 0 && (
                <p className="quiz-hint">
                  퀴즈를 풀지 않아도 자료 분석이 끝났다면 「발표 시작」으로 바로 진행할 수 있습니다.
                </p>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
