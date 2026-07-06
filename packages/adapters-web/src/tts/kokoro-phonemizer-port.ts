import type { PhonemizerPort, RuntimeCapability, Variant } from '@loqua/core';

// kokoro-js expose `phonemize` au runtime (dist bundlé) mais l'oublie dans ses
// types (kokoro.d.ts ne le ré-exporte pas) : on complète la déclaration ici, au
// plus près de l'usage (embarquée partout où le port est importé, contrairement à
// un .d.ts ambient qu'apps/web n'inclurait pas).
declare module 'kokoro-js' {
  export function phonemize(text: string, language?: 'a' | 'b', norm?: boolean): Promise<string>;
}

// eSpeak-NG (via kokoro-js) : langue « a » = anglais américain, « b » = britannique.
const LANGUAGE_BY_VARIANT: Record<Variant, 'a' | 'b'> = {
  'en-US': 'a',
  'en-GB': 'b',
};

const CAPABILITY: RuntimeCapability = {
  available: true,
  qualityTier: 'local-basic',
};

type PhonemizeFn = (text: string, language: 'a' | 'b', norm?: boolean) => Promise<string>;

interface KokoroPhonemizerOptions {
  // Injectable pour les tests ; défaut = kokoro-js (import DYNAMIQUE, cf. engine TTS :
  // évite de charger transformers/onnxruntime-node au prerender Next).
  readonly phonemize?: PhonemizeFn;
}

export function createKokoroPhonemizerPort(options: KokoroPhonemizerOptions = {}): PhonemizerPort {
  const memo = new Map<string, string>();
  const phonemizeFn: PhonemizeFn =
    options.phonemize ??
    (async (text, language, norm) => {
      const { phonemize } = await import('kokoro-js');
      return phonemize(text, language, norm);
    });

  return {
    capability(): RuntimeCapability {
      return CAPABILITY;
    },

    async toIpa(input: { word: string; variant: Variant }): Promise<string> {
      const key = `${input.variant}:${input.word}`;
      const memoized = memo.get(key);
      if (memoized !== undefined) {
        return memoized;
      }
      try {
        const ipa = (await phonemizeFn(input.word, LANGUAGE_BY_VARIANT[input.variant])).trim();
        memo.set(key, ipa);
        return ipa;
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`phonemization failed: ${detail}`);
      }
    },
  };
}
