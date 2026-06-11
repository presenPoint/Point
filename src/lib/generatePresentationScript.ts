import { chatCompletionText, hasOpenAI } from './openai';
import { resolveLocaleForCurrentApp } from '../store/localeStore';
import { aiOutputLanguageRule } from './aiOutputLocale';

/**
 * AI가 발표 주제와 시간을 받아 발표 스크립트 전문을 생성합니다.
 * 반환값: 바로 ScriptUploadPanel에 삽입할 수 있는 plain-text 스크립트.
 */
export async function generatePresentationScript(
  topic: string,
  durationMin: 3 | 5 | 10 = 5,
): Promise<string> {
  if (!hasOpenAI()) {
    return buildMockScript(topic, durationMin);
  }

  const locale = resolveLocaleForCurrentApp();

  const wordTarget =
    durationMin === 3 ? '~400 words' : durationMin === 5 ? '~700 words' : '~1400 words';

  const sys = `You are a professional speechwriter. Write a complete, ready-to-deliver presentation script.

Structure:
1. Opening hook (1–2 sentences that grab attention)
2. Problem / context (what the audience needs to understand)
3. Main body — exactly ${durationMin <= 3 ? 2 : 3} key points, each with a concrete example or story
4. Call to action / closing

Rules:
- Target length: ${wordTarget} (spoken at a natural pace of ~140 wpm)
- Write in first person, as if the speaker is saying it live
- Natural spoken language — no bullet points, no headers, just flowing paragraphs
- Each key point starts on a new line prefixed with "—"
- End with a clear, memorable closing sentence
${aiOutputLanguageRule(locale)}`;

  const user = `Presentation topic: "${topic.trim()}"
Target duration: ${durationMin} minutes

Write the full script now.`;

  const text = await chatCompletionText('gpt-4o', sys, user, 0.7);
  return text?.trim() ?? buildMockScript(topic, durationMin);
}

function buildMockScript(topic: string, durationMin: number): string {
  const locale = resolveLocaleForCurrentApp();
  if (locale === 'ko') {
    return `[데모 스크립트 — OpenAI 키가 없어 예시를 보여드립니다]

안녕하세요. 오늘은 "${topic}"에 대해 말씀드리겠습니다.

—핵심 포인트 1: 이 주제의 핵심은 무엇인지 간결하게 설명합니다.

—핵심 포인트 2: 청중이 기억해야 할 가장 중요한 것 하나를 전달합니다.

${durationMin >= 5 ? '—핵심 포인트 3: 구체적인 사례나 데이터로 논점을 뒷받침합니다.\n\n' : ''}감사합니다. 질문이 있으시면 말씀해 주세요.`;
  }
  return `[Demo script — showing placeholder because no OpenAI key is set]

Good morning. Today I want to talk about "${topic}".

— Key point 1: The core idea of this topic, explained simply and clearly.

— Key point 2: The single most important thing the audience should remember.

${durationMin >= 5 ? '— Key point 3: A concrete example or data point that supports the argument.\n\n' : ''}Thank you. I'm happy to take any questions.`;
}
