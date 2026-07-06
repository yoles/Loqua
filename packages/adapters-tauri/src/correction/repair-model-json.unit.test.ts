import { describe, expect, it } from 'vitest';

import { repairModelJson } from './repair-model-json.ts';

describe('repairModelJson — targeted repair of local model JSON quirks', () => {
  it('quotes an unquoted enum value on the type field', () => {
    expect(repairModelJson('{"type": tense}')).toBe('{"type": "tense"}');
  });

  it('quotes a hyphenated enum value', () => {
    expect(repairModelJson('{"type": word-order}')).toBe('{"type": "word-order"}');
  });

  it('quotes an unquoted value even without whitespace after the colon', () => {
    expect(repairModelJson('{"type":idiom}')).toBe('{"type":"idiom"}');
  });

  it('leaves an already-quoted type value untouched', () => {
    expect(repairModelJson('{"type": "idiom"}')).toBe('{"type": "idiom"}');
  });

  it('removes a trailing comma before a closing brace or bracket', () => {
    expect(repairModelJson('{"a": 1,}')).toBe('{"a": 1}');
    expect(repairModelJson('[1, 2,]')).toBe('[1, 2]');
  });

  it('leaves already-valid JSON structurally intact (still parses to the same value)', () => {
    const valid = '{"correctedText":"ok","corrections":[{"type":"tense"}]}';
    expect(JSON.parse(repairModelJson(valid))).toEqual(JSON.parse(valid));
  });

  it('makes a realistic malformed correction parseable', () => {
    const broken =
      '{"correctedText":"I deployed it","corrections":[{"original":"I have deploy","fixed":"I deployed","type": tense,"explanation":"Simple past."},]}';
    expect(() => JSON.parse(repairModelJson(broken))).not.toThrow();
    const parsed = JSON.parse(repairModelJson(broken)) as {
      corrections: { type: string }[];
    };
    expect(parsed.corrections[0]?.type).toBe('tense');
  });
});
