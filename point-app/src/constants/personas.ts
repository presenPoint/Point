import type { PersonaType } from '../store/sessionStore';
import visionaryPrompt from './personas/steve-jobs-visionary.md?raw';
import oratorPrompt from './personas/barack-obama-orator.md?raw';
import analystPrompt from './personas/angela-merkel-analyst.md?raw';
import connectorPrompt from './personas/brene-brown-connector.md?raw';
import powerhousePrompt from './personas/oprah-winfrey-powerhouse.md?raw';
import elonMuskPrompt from './personas/elon-musk.md?raw';

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

  analyst: {
    id: 'analyst',
    name: 'Angela Merkel',
    description:
      'Composed authority. Minimal gestures, measured pace, data-first delivery. Credibility comes from precision, not performance.',
    config: {
      wpmRange: [130, 170],
      gazeSensitivity: 'mid',
      gestureIntensity: 0.3,
      feedbackTone: 'precise',
    },
    systemPrompt: analystPrompt,
    cardImage: '/personas/analyst.png',
    presentationInfo: {
      archetype: 'The Composed Authority',
      domainFit: 'Policy detail, crisis communication, science & engineering briefings, consensus-style talks',
      summary:
        'Credibility through precision, structure, and calm. Charisma is secondary to evidence, sequence, and proportion.',
      principles: [
        'Every claim needs a warrant—data, precedent, or explicit logic.',
        'Stillness signals control; avoid motion that competes with the message.',
        'Problem → evidence → implication → next step.',
        'Understatement over hype—let numbers carry weight, not adjectives.',
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

  powerhouse: {
    id: 'powerhouse',
    name: 'Oprah Winfrey',
    description:
      'Commanding stage energy. Dynamic movement, powerful vocal projection, audience magnetism. Every word is a conversation with thousands.',
    config: {
      wpmRange: [160, 220],
      gazeSensitivity: 'low',
      gestureIntensity: 0.85,
      feedbackTone: 'empowering',
    },
    systemPrompt: powerhousePrompt,
    cardImage: '/personas/powerhouse.png',
    presentationInfo: {
      archetype: 'The Arena Connector',
      domainFit: 'Stadium keynotes, philanthropy launches, mass-audience inspiration, broadcast-level energy',
      summary:
        'Moral clarity at scale—intimacy for thousands. Dynamic voice and big physicality so the back row feels seen.',
      principles: [
        'Own the stage—movement is intentional, every step supports the line.',
        'Treat voice as an instrument—range and contrast, not one volume.',
        'Gestures must read from the last row; size matches the venue.',
        'Micro-moments of eye contact plus inclusive language.',
      ],
    },
  },

  elon_musk: {
    id: 'elon_musk',
    name: 'Elon Musk',
    description:
      'First-principles missionary. Conversational register, clustered authenticity, numbers as the argument — polish secondary to conviction and logic.',
    config: {
      wpmRange: [155, 185],
      gazeSensitivity: 'mid',
      gestureIntensity: 0.35,
      feedbackTone: 'precise',
    },
    systemPrompt: elonMuskPrompt,
    cardImage: '/personas/elon_musk.png',
    presentationInfo: {
      archetype: 'The Authentic Missionary',
      domainFit: 'Technology, engineering, business strategy, moonshot and vision pitches',
      summary:
        'Depth of belief and precise numbers outweigh rhetorical polish. First-principles thinking and admitted uncertainty can read as strength.',
      principles: [
        'Argue from first principles, not only by analogy.',
        'Make the status quo sound logically absurd before the solution.',
        'Ground claims in specific numbers—they are the argument, not decoration.',
        'Authentic cognition: self-correction and real-time thinking are features.',
      ],
    },
  },
};

export const PERSONA_LIST = Object.values(PERSONAS);
