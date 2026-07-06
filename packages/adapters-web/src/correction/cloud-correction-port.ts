import { correctionPayloadSchema } from './correction-schema.ts';
import {
  CorrectionError,
  makeCorrection,
  type CorrectionPort,
  type CorrectionResult,
  type EgressGuard,
  type RuntimeCapability,
  type Variant,
} from '@loqua/core';

interface CloudCorrectionOptions {
  readonly endpoint: string;
  readonly guard: EgressGuard;
  readonly cloudOptIn: () => boolean; // réglage UI « correction avancée »
  readonly fetchFn?: typeof fetch;
}

// Mémoïsation sur hash(transcript)+variant (idempotence) — djb2 suffit ici.
function transcriptKey(text: string, variant: Variant): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return `${variant}:${hash >>> 0}`;
}

const CAPABILITY: RuntimeCapability = {
  available: true,
  qualityTier: 'cloud-native',
  requiresConsentToSendText: true,
};

export function createCloudCorrectionPort(options: CloudCorrectionOptions): CorrectionPort {
  const fetchFn = options.fetchFn ?? fetch;
  const memo = new Map<string, CorrectionResult>();

  return {
    capability(): RuntimeCapability {
      return CAPABILITY;
    },

    async correct(input: { text: string; variant: Variant }): Promise<CorrectionResult> {
      const key = transcriptKey(input.text, input.variant);
      const memoized = memo.get(key);
      if (memoized !== undefined) {
        return memoized;
      }

      // Point de sortie unique (invariant #2) : AVANT tout accès réseau.
      const decision = options.guard.decide({
        payload: { kind: 'text', purpose: 'correction' },
        cloudOptIn: options.cloudOptIn(),
        capability: CAPABILITY,
      });
      if (!decision.allowed) {
        throw new CorrectionError(`egress refused: ${decision.reason}`);
      }

      // Seuls le texte et la variante partent — jamais d'audio, jamais d'extra.
      let response: Response;
      try {
        response = await fetchFn(options.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: input.text, variant: input.variant }),
        });
      } catch (error: unknown) {
        // Rejet réseau (serveur injoignable, hors ligne) : traduit en erreur de
        // domaine, jamais un TypeError brut (« Load failed ») remonté au core.
        const detail = error instanceof Error ? error.message : String(error);
        throw new CorrectionError(`correction service unreachable: ${detail}`);
      }
      if (!response.ok) {
        throw new CorrectionError(`correction service failed with status ${response.status}`);
      }

      const parsed = correctionPayloadSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) {
        throw new CorrectionError('malformed correction payload from provider');
      }

      const result: CorrectionResult = {
        variant: input.variant,
        correctedText: parsed.data.correctedText,
        corrections: parsed.data.corrections.map((entry) =>
          makeCorrection({
            original: entry.original,
            fixed: entry.fixed,
            type: entry.type,
            explanation: entry.explanation,
            ...(entry.span === undefined ? {} : { span: entry.span }),
          }),
        ),
        qualityTier: 'cloud-native',
      };
      memo.set(key, result);
      return result;
    },
  };
}
