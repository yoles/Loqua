import type { Variant } from '@loqua/core';

const LANG_BY_VARIANT: Record<Variant, string> = {
  'en-US': 'en-US',
  'en-GB': 'en-GB',
};

// Repli navigateur (WebSpeech) : lit le texte directement, sans produire de clip.
// Utilisé quand le TTS local (kokoro / natif desktop) est indisponible — la
// dégradation est VISIBLE via le tier « webspeech » (invariant #5).
export function isWebSpeechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speakWithWebSpeech(
  text: string,
  opts: { variant: Variant; rate: number },
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isWebSpeechAvailable()) {
      reject(new Error('web speech unavailable'));
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG_BY_VARIANT[opts.variant];
    utterance.rate = opts.rate;
    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new Error('web speech failed'));
    window.speechSynthesis.speak(utterance);
  });
}
