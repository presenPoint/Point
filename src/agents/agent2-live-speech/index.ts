export { bufferWithInterim } from '../../lib/speechUtils';
export {
  evaluateWpmWarningsForRate,
  onInterimSpeechTick,
  onTranscriptChunk,
  speechConfigFromPersona,
  getDefaultSpeechConfig,
} from './rule/speechRule';
export type { SpeechRuleConfig } from './rule/speechRule';
export { runSemanticAnalysis } from './semantic/speechSemantic';
export { calcSpeechRateFromHistory, calcInstantWpmFromHistory } from '../../lib/speechRate';
