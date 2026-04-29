/**
 * Live coaching feedback TTS — 순차 큐 방식.
 * OpenAI gpt-4o-mini-tts 우선, 키 없거나 실패 시 Web Speech API 폴백.
 *
 * - 큐에 쌓인 메시지를 순서대로 재생 (끊김 없음)
 * - CRITICAL 메시지는 preempt=true로 호출해 현재 재생 즉시 교체
 * - onSpeakingChange()로 재생 상태를 UI에 구독
 */

import type { FeedbackLevel } from '../types/session';
import { coachTtsParams } from './coachQuestionTts';
import { createSpeechAudio, hasOpenAI } from './openai';
import { effectiveOpenAiTtsVoice } from './coachTtsVoice';
import { useSessionStore } from '../store/sessionStore';

interface QueuedItem {
  text: string;
  level?: FeedbackLevel;
}

// ── Module state ─────────────────────────────────────────────────────────────

let ttsQueue: QueuedItem[] = [];
let isPlaying = false;
/** 세대 번호: cancelFeedbackSpeech() 마다 증가 → 이전 비동기 작업 무효화 */
let generation = 0;

let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;
let primedAudioCtx: AudioContext | null = null;

const speakingListeners = new Set<(speaking: boolean) => void>();

// ── Speaking state ────────────────────────────────────────────────────────────

function notifySpeaking(v: boolean): void {
  speakingListeners.forEach((fn) => fn(v));
}

/** TTS 재생 중 여부를 구독합니다. 반환값을 호출하면 구독 해제. */
export function onSpeakingChange(fn: (speaking: boolean) => void): () => void {
  speakingListeners.add(fn);
  return () => speakingListeners.delete(fn);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasHangul(text: string): boolean {
  return /[ㄱ-힝]/.test(text);
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
    `${langHint}${langHint ? ' ' : ''}` +
    'You are a live presentation coach reading short feedback aloud. Stay brief and intelligible.';
  switch (level) {
    case 'CRITICAL':
      return `${base} Speak with calm urgency — alert but not panicked.`;
    case 'WARN':
      return `${base} Speak in a supportive, steady coaching tone with light emphasis.`;
    default:
      return `${base} Speak in a cheerful and positive tone, encouraging and clear.`;
  }
}

function stopCurrentAudio(): void {
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

// ── Queue processor ───────────────────────────────────────────────────────────

/**
 * 현재 아이템 재생이 끝난 뒤 호출.
 * gen이 현재 세대와 다르면 cancel된 것이므로 무시.
 */
function afterPlayed(gen: number): void {
  stopCurrentAudio();
  setTimeout(() => {
    if (gen !== generation) return;
    isPlaying = false;
    void processQueue(gen);
  }, 180);
}

function speakBrowserTts(item: QueuedItem, gen: number): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    afterPlayed(gen);
    return;
  }
  window.speechSynthesis.cancel();

  const lang = hasHangul(item.text) ? 'ko-KR' : 'en-US';
  const utter = new SpeechSynthesisUtterance(item.text);
  utter.lang = lang;
  utter.rate = 1.05;
  utter.pitch = 1;

  const applyVoice = () => {
    const v = pickVoice(lang);
    if (v) utter.voice = v;
  };
  applyVoice();
  window.speechSynthesis.addEventListener('voiceschanged', applyVoice, { once: true });

  utter.onend = () => afterPlayed(gen);
  utter.onerror = () => afterPlayed(gen);
  window.speechSynthesis.speak(utter);
}

async function processQueue(gen: number): Promise<void> {
  if (gen !== generation) return;
  if (isPlaying || ttsQueue.length === 0) {
    if (!isPlaying) notifySpeaking(false);
    return;
  }

  const item = ttsQueue.shift()!;
  isPlaying = true;
  notifySpeaking(true);

  if (hasOpenAI()) {
    try {
      const persona = useSessionStore.getState().selectedPersona;
      const baseVoice = coachTtsParams(persona).voice;
      const voice = effectiveOpenAiTtsVoice(baseVoice);
      const blob = await createSpeechAudio({
        input: item.text,
        voice,
        instructions: instructionsForLevel(item.level, item.text),
      });

      if (gen !== generation) return; // fetch 중에 cancel됨

      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        currentObjectUrl = url;
        const audio = new Audio(url);
        currentAudio = audio;

        audio.onended = () => afterPlayed(gen);
        audio.onerror = () => {
          stopCurrentAudio();
          speakBrowserTts(item, gen);
        };

        try {
          await audio.play();
          return; // 재생 완료는 onended에서 처리
        } catch (e) {
          console.warn('[Point] TTS autoplay blocked, browser TTS fallback.', e);
          stopCurrentAudio();
          speakBrowserTts(item, gen);
          return;
        }
      }
    } catch (e) {
      console.warn('[Point] OpenAI TTS request failed.', e);
      if (gen !== generation) return;
    }
  }

  speakBrowserTts(item, gen);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * 현재 재생과 큐를 모두 중단합니다.
 * (Visual 모드로 전환하거나 세션 종료 시 호출)
 */
export function cancelFeedbackSpeech(): void {
  generation++;
  ttsQueue = [];
  stopCurrentAudio();
  isPlaying = false;
  notifySpeaking(false);
}

/**
 * 사용자 클릭(Voice 모드 선택) 직후 호출 — 자동재생 차단을 완화합니다.
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
 * 피드백 메시지를 TTS 큐에 추가합니다.
 *
 * @param text    읽을 텍스트
 * @param options
 *   level   — FeedbackLevel (음색·강조 결정)
 *   preempt — true이면 현재 재생 중단 후 이 메시지를 즉시 맨 앞에 삽입 (CRITICAL 용)
 */
export function enqueueFeedback(
  text: string,
  options?: { level?: FeedbackLevel; preempt?: boolean },
): void {
  const trimmed = text.trim();
  if (!trimmed) return;

  if (options?.preempt) {
    // CRITICAL: 현재 재생을 즉시 중단하고 앞에 삽입
    generation++;
    stopCurrentAudio();
    isPlaying = false;
    ttsQueue = [{ text: trimmed, level: options.level }, ...ttsQueue];
  } else {
    // 동일 텍스트 중복 방지
    if (ttsQueue.some((item) => item.text === trimmed)) return;
    ttsQueue.push({ text: trimmed, level: options?.level });
    // 큐 최대 3개 유지 (오래된 것 제거)
    if (ttsQueue.length > 3) ttsQueue.splice(0, ttsQueue.length - 3);
  }

  void processQueue(generation);
}

/** 하위 호환 — 기존 speakFeedbackMessage 호출부 유지 */
export async function speakFeedbackMessage(
  text: string,
  options?: { level?: FeedbackLevel },
): Promise<void> {
  enqueueFeedback(text, options);
}
