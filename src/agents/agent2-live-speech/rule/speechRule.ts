/**
 * Agent 2-A — Speech Rule Engine. Spec: ../AGENT.md
 */
import { feedbackQueue } from '../../shared/feedbackQueue';
import {
  collectKoreanFillerMatches,
  FILLER_PATTERN,
  FILLER_THRESHOLD,
  FILLER_WINDOW_MS,
} from '../../../lib/speechUtils';
import { getDefaultPaceRange, getPersonaPaceRange, type PaceRange } from '../../../lib/speechRate';
import type { AppLocale } from '../../../store/localeStore';
import type { TranscriptEntry, FillerEntry } from '../../../types/session';
import type { PersonaConfig } from '../../../constants/personas';

export interface SpeechRuleConfig {
  paceMin: number;
  paceMax: number;
  paceUnit: PaceRange['unit'];
  locale: AppLocale;
  feedbackTone: string;
}

export function getDefaultSpeechConfig(locale: AppLocale = 'en'): SpeechRuleConfig {
  const r = getDefaultPaceRange(locale);
  return {
    paceMin: r.min,
    paceMax: r.max,
    paceUnit: r.unit,
    locale: r.locale,
    feedbackTone: 'neutral',
  };
}

export function speechConfigFromPersona(pc: PersonaConfig, locale: AppLocale): SpeechRuleConfig {
  const r = getPersonaPaceRange(pc, locale);
  return {
    paceMin: r.min,
    paceMax: r.max,
    paceUnit: r.unit,
    locale: r.locale,
    feedbackTone: pc.feedbackTone,
  };
}

export function pushFillersFromText(
  text: string,
  fillerHistory: FillerEntry[],
  config: SpeechRuleConfig,
  speechSnap: () => string | undefined,
): void {
  const now = Date.now();
  const eng = [...text.matchAll(FILLER_PATTERN)].map((m) => m[0]);
  const kor = collectKoreanFillerMatches(text);
  const matches = [...eng, ...kor];
  for (const raw of matches) {
    fillerHistory.push({ word: raw, timestamp: now });
  }
  const recent = fillerHistory.filter((f) => now - f.timestamp < FILLER_WINDOW_MS);
  fillerHistory.length = 0;
  fillerHistory.push(...recent);
  if (recent.length >= FILLER_THRESHOLD) {
    feedbackQueue.push({
      level: 'WARN',
      msg: fillerMsg(config.feedbackTone, config.locale),
      source: 'SPEECH_RULE',
      cooldown: 30_000,
      speechSnippet: speechSnap(),
    });
  }
}

export function evaluateWpmWarningsForRate(
  rate: number,
  lastWpmWarnAt: { current: number },
  config: SpeechRuleConfig,
  speechSnap: () => string | undefined,
): void {
  const now = Date.now();
  if (rate > config.paceMax && now - lastWpmWarnAt.current > 15_000) {
    lastWpmWarnAt.current = now;
    feedbackQueue.push({
      level: 'WARN',
      msg: toneMsg(config.feedbackTone, true, config.locale),
      source: 'SPEECH_RULE',
      cooldown: 15_000,
      speechSnippet: speechSnap(),
    });
  } else if (rate > 0 && rate < config.paceMin && now - lastWpmWarnAt.current > 15_000) {
    lastWpmWarnAt.current = now;
    feedbackQueue.push({
      level: 'WARN',
      msg: toneMsg(config.feedbackTone, false, config.locale),
      source: 'SPEECH_RULE',
      cooldown: 15_000,
      speechSnippet: speechSnap(),
    });
  }
}

/** interim 델타에서만 필러 검사 (속도 경고는 호출부에서 처리) */
export function onInterimSpeechTick(
  suffix: string,
  fillerHistory: FillerEntry[],
  config: SpeechRuleConfig = getDefaultSpeechConfig(),
  speechSnap: () => string | undefined,
): void {
  if (suffix.trim()) {
    pushFillersFromText(suffix, fillerHistory, config, speechSnap);
  }
}

function fillerMsg(tone: string, locale: AppLocale): string {
  if (locale === 'ko') {
    const ko: Record<string, string> = {
      sharp: '필러가 너무 많아요 — "음"·"어" 하나하나가 신뢰를 깎아요',
      warm: '필러가 들려요 — 대신 잠깐 멈춰 보세요',
    };
    return ko[tone] ?? '필러 단어가 반복되고 있어요';
  }
  const en: Record<string, string> = {
    sharp: 'Too many fillers — every "um" costs you credibility',
    warm: 'I\'m hearing some filler words — try pausing instead',
  };
  return en[tone] ?? 'Filler words are being repeated';
}

function toneMsg(tone: string, tooFast: boolean, locale: AppLocale): string {
  if (locale === 'ko') {
    const ko: Record<string, [string, string]> = {
      sharp: ['속도를 줄이세요 — 말이 겹쳐 들립니다', '너무 느립니다 — 흐름이 끊깁니다'],
      encouraging: ['조금만 천천히 — 말이 귀에 닿게', '템포를 올려 보세요 — 에너지를 이어가세요'],
      precise: ['명료함을 위해 속도를 낮추세요', '몰입을 위해 템포를 올리세요'],
      warm: ['천천히 — 청중이 숨 쉴 틈을 주세요', '조금 더 빠르게 — 대화감을 유지하세요'],
      empowering: ['속도를 조절하세요 — 힘은 절제에서 나옵니다', '에너지를 올리세요 — 공간을 채우세요'],
    };
    const pair = ko[tone];
    return pair ? pair[tooFast ? 0 : 1] : tooFast ? '말이 너무 빠릅니다' : '말이 너무 느립니다';
  }
  const prefix: Record<string, [string, string]> = {
    sharp: ['Cut the speed — your words are blurring together', 'Too slow — you\'re losing momentum'],
    encouraging: ['Ease up a little — let your words land', 'Pick up the pace — carry the energy forward'],
    precise: ['Reduce speed for clarity', 'Increase pace to maintain engagement'],
    warm: ['Slow down — let the audience breathe with you', 'A little faster — keep the conversation flowing'],
    empowering: ['Rein it in — power needs control', 'Bring more energy — own the room'],
  };
  const pair = prefix[tone];
  return pair ? pair[tooFast ? 0 : 1] : tooFast ? 'You\'re speaking too fast' : 'You\'re speaking too slow';
}

export function onTranscriptChunk(
  text: string,
  buffer: TranscriptEntry[],
  fillerHistory: FillerEntry[],
  config: SpeechRuleConfig = getDefaultSpeechConfig(),
  speechSnap: () => string | undefined,
): void {
  const now = Date.now();
  buffer.push({ text, timestamp: now });
  pushFillersFromText(text, fillerHistory, config, speechSnap);
}
