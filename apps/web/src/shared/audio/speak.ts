import { playAudioClip } from './playback';
import { isWebSpeechAvailable, speakWithWebSpeech } from './web-speech';
import type { SpeechSynthesisPort, Variant } from '@loqua/core';

// Fait sortir du son pour un texte : TTS local (kokoro) si disponible, sinon repli
// WebSpeech (invariant #5 : dégradation visible via le tier renvoyé). Renvoie le
// tier réellement utilisé ('local-*' | 'webspeech'), ou null si aucune voie.
export async function speakText(
  text: string,
  variant: Variant,
  rate: number,
  speech: SpeechSynthesisPort | null,
): Promise<string | null> {
  if (speech !== null && speech.capability().available) {
    try {
      const clip = await speech.synthesize({ text, variant, rate });
      const tier = speech.capability().qualityTier;
      await playAudioClip(clip);
      return tier;
    } catch {
      // TTS local en échec → repli WebSpeech ci-dessous.
    }
  }
  if (isWebSpeechAvailable()) {
    await speakWithWebSpeech(text, { variant, rate });
    return 'webspeech';
  }
  return null;
}
