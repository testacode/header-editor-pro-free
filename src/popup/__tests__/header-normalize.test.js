import { describe, test, expect } from 'vitest';
import { normalizeHeader, isHeaderEnabled, isAppendMode } from '../header-normalize.js';

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

describe('isAppendMode (plan 028)', () => {
  test('returns true only when appendMode is strictly true', () => {
    expect(isAppendMode({ appendMode: true })).toBe(true);
  });

  test('returns false when appendMode is missing', () => {
    expect(isAppendMode({})).toBe(false);
  });

  test('returns false for truthy non-boolean values (strict === true)', () => {
    expect(isAppendMode({ appendMode: 'yes' })).toBe(false);
    expect(isAppendMode({ appendMode: 1 })).toBe(false);
  });
});

describe('normalizeHeader preserves appendMode (plan 028)', () => {
  test('keeps appendMode:true', () => {
    expect(normalizeHeader({ name: 'X-Foo', value: 'bar', appendMode: true }).appendMode).toBe(
      true
    );
  });

  test('defaults missing appendMode to false', () => {
    expect(normalizeHeader({ name: 'X-Foo', value: 'bar' }).appendMode).toBe(false);
  });
});
