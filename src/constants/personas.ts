import type { PersonaType } from '../store/sessionStore';
import visionaryPrompt from './personas/steve-jobs-visionary.md?raw';
import oratorPrompt from './personas/barack-obama-orator.md?raw';
import connectorPrompt from './personas/brene-brown-connector.md?raw';

export type GazeSensitivity = 'high' | 'mid' | 'low';

/** 실시간 자막 구간 내 단어 강도 분산 기준(페르소나마다 민감도 다름) */
export interface LiveVoiceSpreadThresholds {
  minWords: number;
  /** max(rel)−min(rel)이 이 값 미만이면 톤이 너무 비슷하다고 안내 */
  flatBelowSpread: number;
  /** max(rel)−min(rel)이 이 값 초과이면 강약이 과도하다고 안내 */
  chaoticAboveSpread: number;
}

/** 페르소나 미선택 시 실시간 톤 분산 기본값 */
export const DEFAULT_LIVE_VOICE_SPREAD: LiveVoiceSpreadThresholds = {
  minWords: 4,
  flatBelowSpread: 0.24,
  chaoticAboveSpread: 0.88,
};

export interface PersonaConfig {
  wpmRange: [number, number];
  gazeSensitivity: GazeSensitivity;
  gestureIntensity: number;
  feedbackTone: string;
  liveVoiceSpread: LiveVoiceSpreadThresholds;
}

/** Short copy shown in the home “style detail” sheet (not the full AI prompt). */
export interface PersonaPresentationInfo {
  archetype: string;
  domainFit: string;
  summary: string;
  principles: string[];
}

export interface Persona {
  id: PersonaType;
  name: string;
  description: string;
  config: PersonaConfig;
  systemPrompt: string;
  /** Home card portrait — file in `public/personas/` */
  cardImage: string;
  presentationInfo: PersonaPresentationInfo;
}

export const PERSONAS: Record<PersonaType, Persona> = {
  visionary: {
    id: 'visionary',
    name: 'Steve Jobs',
    description:
      'Minimalist storyteller. Fewer words, longer pauses, deliberate gestures. Every movement has a purpose — silence is a weapon.',
    config: {
      wpmRange: [120, 160],
      gazeSensitivity: 'high',
      gestureIntensity: 0.4,
      feedbackTone: 'sharp',
      liveVoiceSpread: { minWords: 4, flatBelowSpread: 0.3, chaoticAboveSpread: 0.93 },
    },
    systemPrompt: visionaryPrompt,
    cardImage: '/personas/visionary.png',
    presentationInfo: {
      archetype: 'The Minimalist Storyteller',
      domainFit: 'Product launches, category-defining keynotes, narrative simplification, consumer tech',
      summary:
        'Simplicity and restraint amplify meaning. The audience should feel one clear emotion per beat—wonder, desire, or inevitability.',
      principles: [
        'One idea per slide, one gesture per idea—dilution weakens memory.',
        'Long pauses before and after key lines; silence is part of the message.',
        'Show the product; the presenter’s conviction sells more than a spec list.',
        'Structure for surprise—earn the turn before a reveal or “one more thing.”',
      ],
    },
  },

  orator: {
    id: 'orator',
    name: 'Barack Obama',
    description:
      'Rhythmic cadence with calibrated pace changes. Builds momentum through vocal dynamics — slows down for gravity, speeds up for energy.',
    config: {
      wpmRange: [140, 190],
      gazeSensitivity: 'mid',
      gestureIntensity: 0.6,
      feedbackTone: 'encouraging',
      liveVoiceSpread: { minWords: 4, flatBelowSpread: 0.24, chaoticAboveSpread: 0.87 },
    },
    systemPrompt: oratorPrompt,
    cardImage: '/personas/orator.png',
    presentationInfo: {
      archetype: 'The Rhythmic Unifier',
      domainFit: 'Policy, inspiration, coalition-building, high-stakes public addresses, town halls',
      summary:
        'Cadence, contrast, and moral clarity with warmth. Inclusive “we” language paired with precise facts—hope with scaffolding.',
      principles: [
        'Vary pace: slow for gravity, faster for urgency, silence for reflection.',
        'Lead with a story or image before heavy statistics.',
        'Sweep the room with eye contact; hold briefly, then return.',
        'Parallel structure and repetition-with-variation make lines memorable.',
      ],
    },
  },

  connector: {
    id: 'connector',
    name: 'Brené Brown',
    description:
      'Vulnerability as strength. Conversational warmth, authentic gestures, emotional arc. Connects through shared human experience.',
    config: {
      wpmRange: [150, 200],
      gazeSensitivity: 'low',
      gestureIntensity: 0.7,
      feedbackTone: 'warm',
      liveVoiceSpread: { minWords: 4, flatBelowSpread: 0.2, chaoticAboveSpread: 0.84 },
    },
    systemPrompt: connectorPrompt,
    cardImage: '/personas/connector.png',
    presentationInfo: {
      archetype: 'The Vulnerable Storyteller',
      domainFit: 'Leadership, culture, DEI, coaching, TED-style personal narrative, trust-building keynotes',
      summary:
        'Vulnerability builds trust. Specific, risky details beat polished performance—the audience connects when the speaker almost didn’t share.',
      principles: [
        'Conversational beats performative—talk with people, not at them.',
        'Story before lesson; don’t moralize before the story earns it.',
        'Arc: tension → struggle → insight the audience can own.',
        'Grounded language and real humor—avoid therapy-speak.',
      ],
    },
  },

};

/** 홈 카드 가로 스크롤 순서 — 브레네 박사(connector)를 가운데에 둠 */
export const PERSONA_LIST: Persona[] = [
  PERSONAS.visionary,
  PERSONAS.connector,
  PERSONAS.orator,
];
