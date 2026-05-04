import { chatJson, hasOpenAI } from '../lib/openai';
import type { SessionHistoryItem } from '../store/sessionStore';

export interface ProgressAnalysis {
  summary: string;
  trend_label: 'improving' | 'declining' | 'stable' | 'early';
  strengths: string[];
  growth_areas: string[];
  recommendations: { action: string; reason: string }[];
  highlight?: string;
}

function buildContext(history: SessionHistoryItem[]): string {
  // oldest → newest
  const sorted = [...history].reverse();

  const scoreTable = sorted
    .map((s, i) => {
      const date = new Date(s.started_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      return `Session ${i + 1} (${date}): Overall=${s.composite_score ?? '?'}, Speech=${s.speech_score ?? '?'}, Nonverbal=${s.nonverbal_score ?? '?'}, Q&A=${s.qa_score ?? '?'}, Duration=${Math.round((s.total_duration_sec ?? 0) / 60)}min`;
    })
    .join('\n');

  const allStrengths = history
    .flatMap((s) => s.strengths ?? [])
    .slice(0, 30)
    .map((s) => `- ${s}`)
    .join('\n');

  const allImprovements = history
    .flatMap((s) => {
      const items = s.improvements ?? [];
      return items.map((item) => {
        if (typeof item === 'string') return item;
        const fb = item as { label?: string; situation?: string };
        return [fb.label, fb.situation].filter(Boolean).join(': ');
      });
    })
    .slice(0, 30)
    .map((s) => `- ${s}`)
    .join('\n');

  return `
SCORE HISTORY (oldest → newest):
${scoreTable}

RECURRING STRENGTHS across sessions:
${allStrengths || '(none recorded)'}

RECURRING COACHING / IMPROVEMENTS across sessions:
${allImprovements || '(none recorded)'}
`.trim();
}

const SYSTEM = `You are a data-driven presentation coach analyzing a user's multi-session history.
Return ONLY valid JSON matching this exact schema:
{
  "summary": "2-3 sentence overall assessment of the user's progress arc",
  "trend_label": "improving" | "declining" | "stable" | "early",
  "strengths": ["up to 4 consistent strengths observed across sessions"],
  "growth_areas": ["up to 4 recurring patterns or skill gaps that need work"],
  "recommendations": [
    { "action": "specific actionable practice", "reason": "why this matters for this user's pattern" }
  ],
  "highlight": "optional: one notable achievement or milestone worth calling out (omit if none)"
}
Rules:
- Be direct and specific — reference actual data from the input (scores, dates, patterns)
- recommendations: 2–4 items, each action must be concrete (not generic advice)
- trend_label "early" = fewer than 3 sessions, "improving/declining/stable" based on composite score trend
- Keep every string concise and speakable (not essay prose)
- Match the language style of the user's data`;

export async function analyzeProgress(
  history: SessionHistoryItem[],
): Promise<ProgressAnalysis | null> {
  if (!hasOpenAI() || history.length === 0) return null;
  const context = buildContext(history);
  return chatJson<ProgressAnalysis>('gpt-4o', SYSTEM, context);
}
