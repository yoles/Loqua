import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';

import { DEFAULT_CORRECTION_MODEL, buildAnthropicRequest, extractToolInput } from './anthropic.ts';

// Backend FIN (invariant #3) : le serveur relaie du TEXTE, garde la clé,
// ne lit ni ne journalise jamais le contenu. Aucune logique métier ici.
interface Bindings {
  ANTHROPIC_API_KEY: string;
  CORRECTION_MODEL?: string;
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TEXT_LENGTH = 4000;

// Validation de FORME uniquement (la validation métier vit dans le core).
const correctionInput = z.object({
  text: z.string().min(1).max(MAX_TEXT_LENGTH),
  variant: z.union([z.literal('en-US'), z.literal('en-GB')]),
});

export const app = new Hono<{ Bindings: Bindings }>();

app.use('/v1/*', cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] }));

app.post('/v1/correction', async (c) => {
  const parsed = correctionInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'invalid_input' }, 400);
  }

  const apiKey = c.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    return c.json({ error: 'provider_not_configured' }, 503);
  }

  const model = c.env.CORRECTION_MODEL ?? DEFAULT_CORRECTION_MODEL;
  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(buildAnthropicRequest(parsed.data, model)),
  });

  if (!response.ok) {
    // Code d'erreur seulement — jamais le contenu (ni requête, ni réponse).
    return c.json({ error: 'provider_error', status: response.status }, 502);
  }

  const toolInput = extractToolInput(await response.json());
  if (toolInput === null) {
    return c.json({ error: 'malformed_provider_output' }, 502);
  }

  // Relayé tel quel : la validation Zod complète vit côté client (adapter).
  return c.json(toolInput);
});

export default app;
