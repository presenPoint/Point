import type { PersonaType } from '../store/sessionStore';
import visionaryPrompt from './personas/steve-jobs-visionary.md?raw';
import oratorPrompt from './personas/barack-obama-orator.md?raw';
import connectorPrompt from './personas/brene-brown-connector.md?raw';

export type GazeSensitivity = 'high' | 'mid' | 'low';

export interface PersonaConfig {
  wpmRange: [number, number];
  gazeSensitivity: GazeSensitivity;
  gestureIntensity: number;
  feedbackTone: string;
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

export const PERSONA_LIST = Object.values(PERSONAS);
