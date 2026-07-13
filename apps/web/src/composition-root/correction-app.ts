import type {
  GamificationState,
  PhonemizerPort,
  PipelineRunner,
  PipelineState,
  PronunciationScoringPort,
  ReviewDeck,
  SpeechSynthesisPort,
} from '@loqua/core';
import type { SessionRecord } from '@/entities/session/record';

export interface CorrectionApp {
  readonly state: PipelineState;
  readonly runner: PipelineRunner;
  readonly speechSynthesis: SpeechSynthesisPort | null; // null = TTS local indispo (repli WebSpeech)
  readonly phonemizer: PhonemizerPort | null; // null = phonémisation indispo (desktop en attendant)
  readonly scoring: PronunciationScoringPort; // ear-compare (unscored, Spike #2)
  readonly downloadProgress: number | null; // 0..1 pendant le download du modèle STT
  readonly sttTier: string;
  readonly isDesktop: boolean; // Tauri : 100 % local, le cloud opt-in est masqué
  readonly microphoneConsent: boolean;
  readonly cloudCorrection: boolean;
  readonly sessions: readonly SessionRecord[];
  readonly storagePersistent: boolean | null; // null = stockage indisponible
  readonly review: ReviewDeck | null; // null tant que le stockage n'est pas prêt
  readonly cardsVersion: number; // s'incrémente quand le deck a pu changer
  readonly gamification: GamificationState | null;
  grantMicrophone(): void;
  setCloudCorrection(enabled: boolean): void;
  practiceWord(word: string): void; // mot pratiqué → carte SRS (lot 5.3)
  eraseAll(): Promise<void>;
}
