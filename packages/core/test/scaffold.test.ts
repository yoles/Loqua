import { describe, expect, it } from 'vitest';

import { CORE_NAME } from '../src/index.ts';

describe('scaffold du core', () => {
  it('expose le package core sans dépendance runtime', () => {
    expect(CORE_NAME).toBe('@loqua/core');
  });
});
