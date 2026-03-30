/**
 * Agent 2-B — Speech Semantic Engine. 규격: ../AGENT.md
 */
import { chatJson, hasOpenAI } from '../../../lib/openai';
import { feedbackQueue } from '../../shared/feedbackQueue';
import type { OffTopicEntry } from '../../../types/session';

type SemanticResult = {
  off_topic: boolean;
  off_topic_reason: string;
  logic_break: boolean;
  logic_break_reason: string;
  ambiguous_phrases: string[];
  feedback_message: string | null;
};

const SYSTEM = (summary: string, history: OffTopicEntry[]) => `너는 발표 코치다. 발표자의 최근 30초 발화를 분석해서 JSON으로만 응답해라.

발표 주제 요약: ${summary}
이전 분석 이력: ${JSON.stringify(history.slice(-2))}

응답 형식:
{
  "off_topic": true/false,
  "off_topic_reason": "이탈 이유 (off_topic이 true인 경우)",
  "logic_break": true/false,
  "logic_break_reason": "흐름 단절 이유",
  "ambiguous_phrases": ["감지된 모호 표현 목록"],
  "feedback_message": "사용자에게 보여줄 피드백 문장 (없으면 null)"
}

규칙:
- feedback_message는 20자 이내로 간결하게
- off_topic 판단은 엄격하게 (주제와 완전히 무관한 경우만 true)
- 발화가 너무 짧아 판단 불가 시 모든 값 false 반환`;

export async function runSemanticAnalysis(
  recentText: string,
  materialSummary: string,
  offTopicLog: OffTopicEntry[],
  onResult: (payload: { offTopic?: OffTopicEntry; ambiguousDelta: number }) => void
): Promise<void> {
  if (recentText.length < 50) return;

  let result: SemanticResult | null = null;
  if (hasOpenAI()) {
    result = await chatJson<SemanticResult>(
      'gpt-4o-mini',
      SYSTEM(materialSummary, offTopicLog),
      recentText
    );
  }

  if (!result) {
    const vague = (recentText.match(/대략|뭔가|어떤 식으로|나름대로/g) ?? []).length;
    result = {
      off_topic: false,
      off_topic_reason: '',
      logic_break: false,
      logic_break_reason: '',
      ambiguous_phrases: vague ? ['모호 표현'] : [],
      feedback_message: vague ? '표현을 구체적으로' : null,
    };
  }

  const ambiguousDelta = result.ambiguous_phrases?.length ?? 0;

  if (result.feedback_message) {
    const level = result.off_topic ? 'CRITICAL' : 'WARN';
    feedbackQueue.push({
      level,
      msg: result.feedback_message.slice(0, 40),
      source: 'SPEECH_SEMANTIC',
      cooldown: result.off_topic ? 60_000 : 15_000,
    });
  }

  if (result.off_topic) {
    onResult({
      offTopic: {
        timestamp: Date.now(),
        excerpt: recentText.slice(0, 100),
        reason: result.off_topic_reason || 'off_topic',
      },
      ambiguousDelta,
    });
  } else {
    onResult({ ambiguousDelta });
  }
}
