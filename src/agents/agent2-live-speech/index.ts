export {
  bufferWithInterim,
  calcInstantWpmFromHistory,
  calcWpm,
  evaluateWpmWarningsForRate,
  onInterimSpeechTick,
  onTranscriptChunk,
  speechConfigFromPersona,
  getDefaultSpeechConfig,
} from './rule/speechRule';
export type { WpmHistorySample } from './rule/speechRule';
export type { SpeechRuleConfig } from './rule/speechRule';
export { runSemanticAnalysis } from './semantic/speechSemantic';
