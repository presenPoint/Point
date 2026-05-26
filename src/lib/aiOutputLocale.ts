import type { AppLocale } from '../store/localeStore';

/** LLM 시스템 프롬프트용 — 사용자에게 보이는 출력 언어 규칙 */
export function aiOutputLanguageRule(locale: AppLocale): string {
  if (locale === 'ko') {
    return `OUTPUT LANGUAGE (HARD REQUIREMENT — overrides any other example or default in this prompt):
- 모든 사용자에게 보이는 문장은 반드시 자연스러운 한국어(존댓말)로 작성하세요.
- JSON의 모든 string 값(label, situation, stop_doing, start_doing, expected_impact, strengths, event, style_alignment, delivery_practices, phrase_rewrites 등)을 한국어로 작성하세요.
- "Posture Stability", "Speech Pace", "Plant your feet…" 같은 영어 제목·문장은 절대 사용 금지. 영어로 답하면 응답이 무효 처리됩니다.
- 중국어(汉字)·일본어 한자·번체·간체 한자 사용 금지. 한글과 필요한 영문 약어(예: AI, ROI)만 허용.
- 예: "Posture Stability" → "자세 안정", "Speech Pace" → "말 빠르기".`;
  }
  return `OUTPUT LANGUAGE (HARD REQUIREMENT): Write every user-facing string value in clear, natural English. Do not output Korean characters anywhere in the JSON values.`;
}

/** 한글 문자 비율 (대략) — locale 검증용 */
const HANGUL_RE = /[\uAC00-\uD7AF]/;
const LATIN_LETTER_RE = /[A-Za-z]/g;
const HANGUL_LETTER_RE = /[\uAC00-\uD7AF]/g;

/** 응답 문자열이 기대 언어에 부합하는지 (대략) — 너무 영어가 많은 한국어 응답 등을 잡음 */
export function looksLikeLocale(text: string, locale: AppLocale): boolean {
  if (!text) return true;
  const latin = (text.match(LATIN_LETTER_RE) ?? []).length;
  const hangul = (text.match(HANGUL_LETTER_RE) ?? []).length;
  if (locale === 'ko') {
    if (hangul === 0 && latin > 8) return false;
    if (latin > hangul * 3 && latin > 20) return false;
    return HANGUL_RE.test(text) || latin < 8;
  }
  return hangul < 4;
}

/** 객체의 모든 string 값이 기대 언어인지 대략 검사 */
export function deepLocaleOk(value: unknown, locale: AppLocale): boolean {
  if (typeof value === 'string') return looksLikeLocale(value, locale);
  if (Array.isArray(value)) return value.every((v) => deepLocaleOk(v, locale));
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every((v) => deepLocaleOk(v, locale));
  }
  return true;
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
