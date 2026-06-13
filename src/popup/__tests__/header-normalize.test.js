import { describe, test, expect } from 'vitest';
import { normalizeHeader, isHeaderEnabled } from '../header-normalize.js';

describe('isHeaderEnabled', () => {
  test('returns true when enabled is explicitly true', () => {
    expect(isHeaderEnabled({ enabled: true })).toBe(true);
  });

  test('returns false when enabled is explicitly false', () => {
    expect(isHeaderEnabled({ enabled: false })).toBe(false);
  });

  test('returns true when enabled is missing (missing = enabled)', () => {
    expect(isHeaderEnabled({})).toBe(true);
  });
});

describe('normalizeHeader uses isHeaderEnabled for the enabled field', () => {
  test('fills missing enabled as true', () => {
    expect(normalizeHeader({ name: 'X-Foo', value: 'bar' }).enabled).toBe(true);
  });

  test('preserves enabled:false', () => {
    expect(normalizeHeader({ name: 'X-Foo', value: 'bar', enabled: false }).enabled).toBe(false);
  });
});
