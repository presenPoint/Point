export type SessionStatus =
  | 'IDLE'
  | 'PRE_QUIZ'
  | 'PRESENTING'
  | 'POST_QA'
  | 'REPORT'
  | 'DONE';

export interface QuizItem {
  id: number;
  question: string;
  key_points: string[];
}

/** 사전 퀴즈 문항별 채점 결과 (제출 후 표시) */
export interface PreQuizQuestionGrade {
  id: number;
  score: number;
  feedback: string;
}

/** 서술형 문항: 이 점수 이상이면 UI에서 「적절」로 표시 */
export const PRE_QUIZ_PASS_SCORE = 70;

export interface WpmEntry {
  timestamp: number;
  wpm: number;
}

export interface OffTopicEntry {
  timestamp: number;
  excerpt: string;
  reason: string;
}

export interface GazeEntry {
  timestamp: number;
  is_gazing: boolean;
}

export interface PostureEntry {
  timestamp: number;
  angle: number;
  is_ok: boolean;
}

export interface GestureEntry {
  timestamp: number;
  type: 'excess' | 'lack';
}

export interface QaExchange {
  turn: number;
  question: string;
  answer: string;
  score?: number;
}

export interface SessionContext {
  session_id: string;
  user_id: string;
  status: SessionStatus;
  started_at: string;
  ended_at?: string;

  material: {
    raw_text: string;
    summary: string;
    keywords: string[];
    quiz: QuizItem[];
    pre_quiz_score: number;
    /** 문항별 점수·피드백 (전체 제출 채점 후) */
    pre_quiz_grades: PreQuizQuestionGrade[];
    weak_areas: string[];
  };

  speech_coaching: {
    wpm_log: WpmEntry[];
    filler_count: number;
    filler_timestamps: number[];
    off_topic_log: OffTopicEntry[];
    ambiguous_count: number;
    total_duration_sec: number;
    transcript_log: TranscriptEntry[];
  };

  nonverbal_coaching: {
    gaze_rate: number;
    gaze_log: GazeEntry[];
    posture_log: PostureEntry[];
    gesture_log: GestureEntry[];
  };

  qa: {
    exchanges: QaExchange[];
    final_score: number;
    best_answer_turn: number;
    worst_answer_turn: number;
  };

  report: {
    composite_score: number;
    speech_score: number;
    nonverbal_score: number;
    qa_score: number;
    strengths: string[];
    improvements: string[];
    generated_at: string;
  };
}

export type AgentId =
  | 'ORCHESTRATOR'
  | 'MATERIAL'
  | 'SPEECH_RULE'
  | 'SPEECH_SEMANTIC'
  | 'NONVERBAL'
  | 'QA'
  | 'REPORT';

export interface TranscriptEntry {
  text: string;
  timestamp: number;
}

export interface FillerEntry {
  word: string;
  timestamp: number;
}

export type FeedbackLevel = 'CRITICAL' | 'WARN' | 'INFO';

export type FeedbackSource = 'SPEECH_RULE' | 'SPEECH_SEMANTIC' | 'NONVERBAL';

export interface FeedbackItem {
  id: string;
  level: FeedbackLevel;
  msg: string;
  source: FeedbackSource;
  cooldown: number;
  createdAt: number;
  silent?: boolean;
}

export interface ReportScores {
  compositeScore: number;
  speechScore: number;
  nonverbalScore: number;
  qaScore: number;
}
