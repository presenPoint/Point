import type { MessageKey } from '../locales/messages';
import type { PersonaType } from '../store/sessionStore';

/** 홈 카드·상세 모달에 표시할 페르소나 카피 — `messages.ts` 키와 1:1 */
export const PERSONA_UI_KEYS: Record<
  PersonaType,
  {
    name: MessageKey;
    description: MessageKey;
    archetype: MessageKey;
    domainFit: MessageKey;
    summary: MessageKey;
    principles: readonly [MessageKey, MessageKey, MessageKey, MessageKey];
  }
> = {
  visionary: {
    name: 'persona.visionary.name',
    description: 'persona.visionary.description',
    archetype: 'persona.visionary.archetype',
    domainFit: 'persona.visionary.domainFit',
    summary: 'persona.visionary.summary',
    principles: [
      'persona.visionary.principle0',
      'persona.visionary.principle1',
      'persona.visionary.principle2',
      'persona.visionary.principle3',
    ],
  },
  connector: {
    name: 'persona.connector.name',
    description: 'persona.connector.description',
    archetype: 'persona.connector.archetype',
    domainFit: 'persona.connector.domainFit',
    summary: 'persona.connector.summary',
    principles: [
      'persona.connector.principle0',
      'persona.connector.principle1',
      'persona.connector.principle2',
      'persona.connector.principle3',
    ],
  },
  orator: {
    name: 'persona.orator.name',
    description: 'persona.orator.description',
    archetype: 'persona.orator.archetype',
    domainFit: 'persona.orator.domainFit',
    summary: 'persona.orator.summary',
    principles: [
      'persona.orator.principle0',
      'persona.orator.principle1',
      'persona.orator.principle2',
      'persona.orator.principle3',
    ],
  },
};

export const PERSONA_FEEDBACK_TONE_KEYS: Record<string, MessageKey> = {
  sharp: 'persona.feedbackTone.sharp',
  encouraging: 'persona.feedbackTone.encouraging',
  warm: 'persona.feedbackTone.warm',
};
