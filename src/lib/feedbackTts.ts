/** Live coaching feedback 읽기 — OpenAI TTS 우선, 키 없을 때만 Web Speech API. */

import type { FeedbackLevel } from '../types/session';
import { createSpeechAudio, hasOpenAI } from './openai';

function hasHangul(text: string): boolean {
  return /[\u3131-\uD79D]/.test(text);
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const exact = voices.find((v) => v.lang === lang);
  if (exact) return exact;
  const short = lang.split('-')[0] ?? '';
  return voices.find((v) => v.lang.startsWith(short)) ?? voices[0] ?? null;
}

function instructionsForLevel(level: FeedbackLevel | undefined, text: string): string {
  const langHint = hasHangul(text)
    ? 'The input may be Korean — use natural Korean pronunciation and intonation.'
    : '';
  const base =
    langHint +
    (langHint ? ' ' : '') +
    'You are a live presentation coach reading short feedback aloud. Stay brief and intelligible.';
  switch (level) {
    case 'CRITICAL':
      return `${base} Speak with calm urgency — alert but not panicked.`;
    case 'WARN':
      return `${base} Speak in a supportive, steady coaching tone with light emphasis.`;
    default:
      return `${base} Speak in a cheerful and positive tone, like the example: encouraging and clear.`;
  }
}

function speakWithBrowserTts(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();

  const lang = hasHangul(text) ? 'ko-KR' : 'en-US';
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 1.05;
  utter.pitch = 1;

  const applyVoice = () => {
    const v = pickVoice(lang);
    if (v) utter.voice = v;
  };
  applyVoice();
  window.speechSynthesis.addEventListener('voiceschanged', applyVoice, { once: true });
  window.speechSynthesis.speak(utter);
}

let primedAudioCtx: AudioContext | null = null;

let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;

function stopOpenAiAudio(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio.removeAttribute('src');
    currentAudio = null;
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

export function cancelFeedbackSpeech(): void {
  stopOpenAiAudio();
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * 사용자 클릭(예: Voice 모드 선택) 직후 한 번 호출하면 자동재생 차단을 완화합니다.
 * 피드백은 비동기로 도착하므로 브라우저가 묵음 처리하는 경우가 많습니다.
 */
export function primeFeedbackAudio(): void {
  if (typeof window === 'undefined') return;
  try {
    type Win = Window & { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext ?? (window as Win).webkitAudioContext;
    if (AC) {
      if (!primedAudioCtx || primedAudioCtx.state === 'closed') {
        primedAudioCtx = new AC();
      }
      void primedAudioCtx.resume();
      const osc = primedAudioCtx.createOscillator();
      const gain = primedAudioCtx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(primedAudioCtx.destination);
      osc.start();
      osc.stop(primedAudioCtx.currentTime + 0.02);
    }
  } catch {
    /* ignore */
  }
  try {
    const silentWav =
      'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    const warm = new Audio(silentWav);
    warm.volume = 0.001;
    void warm.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * OpenAI `gpt-4o-mini-tts`로 재생합니다. API 키가 없거나 실패 시 브라우저 TTS로 폴백합니다.
 */
export async function speakFeedbackMessage(
  text: string,
  options?: { level?: FeedbackLevel }
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  cancelFeedbackSpeech();

  if (hasOpenAI()) {
    try {
      const blob = await createSpeechAudio({
        input: trimmed,
        voice: 'coral',
        instructions: instructionsForLevel(options?.level, trimmed),
      });
      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        currentObjectUrl = url;
        const audio = new Audio(url);
        currentAudio = audio;
        audio.onended = () => {
          stopOpenAiAudio();
        };
        audio.onerror = () => {
          stopOpenAiAudio();
          speakWithBrowserTts(trimmed);
        };
        try {
          await audio.play();
          return;
        } catch (e) {
          console.warn('[Point] TTS playback blocked or failed, using browser speech.', e);
          stopOpenAiAudio();
          speakWithBrowserTts(trimmed);
          return;
        }
      }
    } catch (e) {
      console.warn('[Point] OpenAI speech request failed.', e);
    }
  }

  speakWithBrowserTts(trimmed);
}
