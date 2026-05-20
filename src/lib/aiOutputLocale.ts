import type { AppLocale } from '../store/localeStore';

/** LLM 시스템 프롬프트용 — 사용자에게 보이는 출력 언어 규칙 */
export function aiOutputLanguageRule(locale: AppLocale): string {
  if (locale === 'ko') {
    return `- 모든 사용자에게 보이는 문장은 자연스러운 한국어(존댓말)로 작성하세요.
- JSON의 label, situation, stop_doing, start_doing, expected_impact, strengths, event, style_alignment, delivery_practices, phrase_rewrites 등 모든 문자열 값도 한국어로 작성하세요. "Speech Pace", "Posture Stability" 같은 영어 제목·문장은 금지합니다.
- 중국어(汉字), 일본어 한자, 번체·간체 한자를 쓰지 마세요. 한글과 필요한 영문 약어만 사용하세요.
- 예: "勢" 대신 "기세" 또는 "모멘텀"처럼 한글로 표현하세요.`;
  }
  return '- Write all user-facing text in clear English.';
}

const HAN_IDEOGRAPH = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;

const HAN_REPLACEMENTS: Record<string, string> = {
  勢: '기세',
  强: '강',
  弱: '약',
  高: '높',
  低: '낮',
};

/** 한국어 UI/리포트에서 뜨는 한자·중국어 문자 제거(안전망) */
export function sanitizeKoUserFacingText(text: string): string {
  if (!text) return text;
  let s = text;
  for (const [han, hangul] of Object.entries(HAN_REPLACEMENTS)) {
    s = s.split(han).join(hangul);
  }
  s = s.replace(HAN_IDEOGRAPH, '');
  return s.replace(/\s{2,}/g, ' ').trim();
}

export function sanitizeKoUserFacingDeep<T>(value: T, locale: AppLocale): T {
  if (locale !== 'ko') return value;
  if (typeof value === 'string') return sanitizeKoUserFacingText(value) as T;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeKoUserFacingDeep(item, locale)) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeKoUserFacingDeep(v, locale);
    }
    return out as T;
  }
  return value;
}
