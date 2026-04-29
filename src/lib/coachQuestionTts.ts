/**
 * 사전 퀴즈·발표 후 Q&A 질문을 “선택 코치 느낌”으로 읽어 줍니다.
 * OpenAI gpt-4o-mini-tts (voice + instructions) 우선, 키 없으면 Web Speech API.
 */

import { createSpeechAudio, hasOpenAI } from './openai';
import { effectiveOpenAiTtsVoice } from './coachTtsVoice';
import type { PersonaType } from '../store/sessionStore';

let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;

function stopAudio(): void {
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

function hasHangul(text: string): boolean {
  return /[ㄱ-힝]/.test(text);
}

/** 페르소나별 OpenAI TTS voice + 읽기 스타일 instructions */
export function coachTtsParams(persona: PersonaType | null): { voice: string; instructions: string } {
  switch (persona) {
    case 'visionary':
      return {
        voice: 'coral',
        instructions:
          'You are a minimalist keynote coach: crisp, confident, slightly slower pacing, short pauses between ideas. ' +
          'Read the following as a single quiz question — do not add commentary. Match the language of the text.',
      };
    case 'orator':
      return {
        voice: 'onyx',
        instructions:
          'You are a warm, rhythmic public speaker: clear cadence, inclusive tone, slight emphasis on key words. ' +
          'Read the following as one quiz question only — no preamble. Match the language of the text.',
      };
    case 'connector':
      return {
        voice: 'sage',
        instructions:
          'You are a grounded, conversational coach: approachable, human, gentle warmth without being saccharine. ' +
          'Read the following as one quiz question only — no extra chat. Match the language of the text.',
      };
    default:
      return {
        voice: 'coral',
        instructions:
          'Speak clearly as a concise presentation coach. Read the following once with steady pacing. Match the language of the text.',
      };
  }
}

function speakBrowser(text: string, rate = 0.98): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = hasHangul(text) ? 'ko-KR' : 'en-US';
  u.rate = rate;
  window.speechSynthesis.speak(u);
}

/** 진행 중인 질문 음성을 즉시 멈춥니다. */
export function stopCoachQuestionSpeech(): void {
  stopAudio();
}

/**
 * 질문(또는 짧은 안내)을 코치 스타일 TTS로 재생합니다. 이전 재생은 끊습니다.
 * 자동재생이 막히면 조용히 실패할 수 있으므로, 중요한 경우 버튼에서 한 번 더 호출하세요.
 */
export async function speakCoachQuestion(text: string, persona: PersonaType | null): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  stopCoachQuestionSpeech();

  if (hasOpenAI()) {
    const { voice: personaVoice, instructions } = coachTtsParams(persona);
    const voice = effectiveOpenAiTtsVoice(personaVoice);
    const blob = await createSpeechAudio({ input: trimmed, voice, instructions });
    if (blob) {
      const url = URL.createObjectURL(blob);
      currentObjectUrl = url;
      const audio = new Audio(url);
      currentAudio = audio;
      try {
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error('Audio playback failed'));
          void audio.play().catch((e) => reject(e instanceof Error ? e : new Error(String(e))));
        });
      } catch {
        stopAudio();
        speakBrowser(trimmed);
        return;
      }
      stopAudio();
      return;
    }
  }

  speakBrowser(trimmed);
}

/** 라이브 코칭 패널 — 정중한 말투·속도 데모 (듣고 따라 말하기용) */
export type CoachGuideDemoId = 'formal_ko' | 'steady_en';

const GUIDE_DEMOS: Record<CoachGuideDemoId, { text: string; instructions: string; browserRate: number }> = {
  formal_ko: {
    text: '안녕하십니까. 오늘 말씀드릴 내용은 세 가지입니다. 바쁘신 가운데 시간 내주셔서 감사합니다.',
    instructions:
      'You are modeling formal Korean business speech. Read ONLY the input text once. ' +
      'Use polite formal Korean (합니다/습니다), calm respectful tone, clear pauses between sentences. ' +
      'Do not translate, explain, or add filler.',
    browserRate: 0.9,
  },
  steady_en: {
    text:
      'Good afternoon. I have three brief points. First, name the outcome. Second, give one concrete example. Third, end with a single clear ask.',
    instructions:
      'You are modeling ideal live-talk pacing in English. Read ONLY the input text once. ' +
      'Steady, deliberate speed — about one beat per comma, confident warm tone, crisp consonants. ' +
      'Do not add commentary or meta language.',
    browserRate: 0.88,
  },
};

/**
 * 코칭 가이드 데모 문장을 TTS로 재생합니다. `speakCoachQuestion`과 동일한 출력 경로를 공유합니다.
 * 버튼 클릭 전 `primeFeedbackAudio()` 호출을 권장합니다.
 */
export async function speakCoachGuideDemo(id: CoachGuideDemoId, persona: PersonaType | null): Promise<void> {
  const demo = GUIDE_DEMOS[id];
  const trimmed = demo.text.trim();
  if (!trimmed) return;

  stopCoachQuestionSpeech();

  if (hasOpenAI()) {
    const { voice: personaVoice } = coachTtsParams(persona);
    const voice = effectiveOpenAiTtsVoice(personaVoice);
    const blob = await createSpeechAudio({
      input: trimmed,
      voice,
      instructions: demo.instructions,
    });
    if (blob) {
      const url = URL.createObjectURL(blob);
      currentObjectUrl = url;
      const audio = new Audio(url);
      currentAudio = audio;
      try {
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error('Audio playback failed'));
          void audio.play().catch((e) => reject(e instanceof Error ? e : new Error(String(e))));
        });
      } catch {
        stopAudio();
        speakBrowser(trimmed, demo.browserRate);
        return;
      }
      stopAudio();
      return;
    }
  }

  speakBrowser(trimmed, demo.browserRate);
}
