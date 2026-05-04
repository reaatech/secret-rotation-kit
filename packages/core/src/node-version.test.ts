import { describe, expect, it } from 'vitest';
import { assertNodeVersion } from './node-version.js';

describe('assertNodeVersion', () => {
  it('does not throw on Node.js 20+', () => {
    expect(() => assertNodeVersion()).not.toThrow();
  });
});
