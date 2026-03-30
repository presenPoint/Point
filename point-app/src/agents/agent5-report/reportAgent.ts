/**
 * Agent 5 — Report & Analytics. 규격: ./AGENT.md
 */
import { chatJson, hasOpenAI } from '../../lib/openai';
import type { ReportScores, SessionContext } from '../../types/session';

function calcWpmScore(wpmLog: { wpm: number }[]): number {
  if (wpmLog.length === 0) return 70;
  const inRange = wpmLog.filter((e) => e.wpm >= 250 && e.wpm <= 350).length;
  return Math.round((inRange / wpmLog.length) * 100);
}

export function calcCompositeScore(ctx: SessionContext): ReportScores {
  const wpmScore = calcWpmScore(ctx.speech_coaching.wpm_log);
  const fillerScore = Math.max(0, 100 - ctx.speech_coaching.filler_count * 5);
  const offTopicScore = Math.max(0, 100 - ctx.speech_coaching.off_topic_log.length * 15);
  const ambiguousScore = Math.max(0, 100 - ctx.speech_coaching.ambiguous_count * 3);

  const speechScore = Math.round(
    wpmScore * 0.3 + fillerScore * 0.3 + offTopicScore * 0.25 + ambiguousScore * 0.15
  );

  const gazeScore = Math.round(ctx.nonverbal_coaching.gaze_rate * 100);
  const pl = ctx.nonverbal_coaching.posture_log;
  const postureScore =
    pl.length === 0
      ? 75
      : Math.round((pl.filter((e) => e.is_ok).length / pl.length) * 100);

  const gestureExcess = ctx.nonverbal_coaching.gesture_log.filter((e) => e.type === 'excess').length;
  const gestureLack = ctx.nonverbal_coaching.gesture_log.filter((e) => e.type === 'lack').length;
  const gestureScore = Math.max(0, 100 - gestureExcess * 10 - gestureLack * 5);

  const nonverbalScore = Math.round(gazeScore * 0.5 + postureScore * 0.3 + gestureScore * 0.2);

  const qaScore = ctx.qa.final_score || 0;

  const compositeScore = Math.round(speechScore * 0.4 + nonverbalScore * 0.3 + qaScore * 0.3);

  return { compositeScore, speechScore, nonverbalScore, qaScore };
}

type ReportNarrative = { strengths: string[]; improvements: string[] };

export async function generateReportNarrative(
  ctx: SessionContext,
  scores: ReportScores
): Promise<ReportNarrative> {
  const avgWpm =
    ctx.speech_coaching.wpm_log.length === 0
      ? 0
      : Math.round(
          ctx.speech_coaching.wpm_log.reduce((a, b) => a + b.wpm, 0) /
            ctx.speech_coaching.wpm_log.length
        );

  const offExcerpts = ctx.speech_coaching.off_topic_log.map((e) => e.excerpt).join(' / ');

  const userBlock = [
    `총 발표 시간: ${ctx.speech_coaching.total_duration_sec}초`,
    `평균 WPM: ${avgWpm}`,
    `추임새 횟수: ${ctx.speech_coaching.filler_count}회`,
    `문맥 이탈 횟수: ${ctx.speech_coaching.off_topic_log.length}회 / ${offExcerpts}`,
    `시선 응시율: ${Math.round(ctx.nonverbal_coaching.gaze_rate * 100)}%`,
    `자세 안정성 점수: ${scores.nonverbalScore}점(참고)`,
    `Q&A 점수: ${scores.qaScore}점 / 취약 턴: ${ctx.qa.worst_answer_turn}`,
  ].join('\n');

  const sys = `너는 발표 코치다. 아래 발표 세션 데이터를 분석해서 JSON으로만 응답해라.
추상적인 표현 말고 실제 데이터를 근거로 구체적으로 써라.

[세션 데이터]
${userBlock}

응답 형식:
{
  "strengths": ["잘한 점 1", "잘한 점 2", "잘한 점 3"],
  "improvements": ["개선점 1", "개선점 2", "개선점 3"]
}`;

  if (!hasOpenAI()) {
    return {
      strengths: [
        `발표 시간 ${ctx.speech_coaching.total_duration_sec}초 동안 진행했습니다.`,
        `Q&A 점수 ${scores.qaScore}점 수준입니다.`,
        '자료 요약 이해도를 사전 퀴즈로 확인했습니다.',
      ],
      improvements: [
        'WPM을 250~350 음절/분 범위로 맞춰 보세요.',
        '추임새를 줄이고 시선을 카메라(청중) 쪽으로 유지해 보세요.',
        '취약 영역 질문에 근거를 덧붙여 답변해 보세요.',
      ],
    };
  }

  const parsed = await chatJson<ReportNarrative>('gpt-4o', sys, '데이터는 위 시스템 메시지에 있다.');
  if (!parsed?.strengths?.length) {
    return {
      strengths: [
        `종합 점수 ${scores.compositeScore}점 기준으로 요약을 생성하지 못했습니다.`,
        `언어 ${scores.speechScore}점, 비언어 ${scores.nonverbalScore}점, Q&A ${scores.qaScore}점입니다.`,
      ],
      improvements: ['API 응답 형식을 확인하거나 잠시 후 다시 시도하세요.'],
    };
  }
  return parsed;
}
