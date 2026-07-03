import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { app } from './index.ts';

const env = { ANTHROPIC_API_KEY: 'sk-test' };

function anthropicReply(toolInput: unknown): Response {
  return new Response(
    JSON.stringify({
      content: [{ type: 'tool_use', name: 'report_correction', input: toolInput }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('POST /v1/correction (LLM provider always mocked)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('relays the tool output as-is on success', async () => {
    const payload = { correctedText: 'Yesterday I deployed', corrections: [] };
    fetchMock.mockResolvedValue(anthropicReply(payload));

    const res = await app.request(
      '/v1/correction',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Yesterday I have make a deploy', variant: 'en-US' }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
  });

  it('forwards only text and variant to the provider — never anything else', async () => {
    fetchMock.mockResolvedValue(anthropicReply({ correctedText: 'x', corrections: [] }));

    await app.request(
      '/v1/correction',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'hello world', variant: 'en-GB' }),
      },
      env,
    );

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const body = JSON.parse((call?.[1] as { body: string }).body) as {
      messages: { content: string }[];
    };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.content).toContain('hello world');
    expect(body.messages[0]?.content).toContain('en-GB');
    expect(JSON.stringify(body)).not.toContain('audio');
  });

  it.each([
    ['missing text', { variant: 'en-US' }],
    ['empty text', { text: '', variant: 'en-US' }],
    ['unknown variant', { text: 'hi', variant: 'fr-FR' }],
    ['oversized text', { text: 'a'.repeat(4001), variant: 'en-US' }],
    ['non-JSON body', null],
  ])('rejects %s with 400 without calling the provider', async (_label, body) => {
    const res = await app.request(
      '/v1/correction',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body === null ? 'not json' : JSON.stringify(body),
      },
      env,
    );

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 503 when the API key is not configured', async () => {
    const res = await app.request(
      '/v1/correction',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'hi', variant: 'en-US' }),
      },
      { ANTHROPIC_API_KEY: '' },
    );

    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a provider failure to 502 without leaking content', async () => {
    fetchMock.mockResolvedValue(new Response('upstream error', { status: 500 }));

    const res = await app.request(
      '/v1/correction',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'hi', variant: 'en-US' }),
      },
      env,
    );

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'provider_error', status: 500 });
  });

  it('maps a reply without tool_use to 502 malformed', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'chat instead' }] }), {
        status: 200,
      }),
    );

    const res = await app.request(
      '/v1/correction',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'hi', variant: 'en-US' }),
      },
      env,
    );

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'malformed_provider_output' });
  });
});
