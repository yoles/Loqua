import type { AudioClip } from './audio-clip.ts';
import type { RuntimeCapability } from './runtime-capability.ts';
import type { Variant } from '../shared/variant.ts';

export interface SpeechSynthesisPort {
  capability(): RuntimeCapability;
  synthesize(input: { text: string; variant: Variant; rate?: number }): Promise<AudioClip>;
}
