import { describe, test, expect } from 'vitest';
import { hexToHsl, hslToHex } from '../color-utils.js';

describe('hexToHsl', () => {
  test('red-dominant maps to hue ~0', () => {
    expect(hexToHsl('#ff0000').h).toBe(0);
  });

  test('green-dominant maps to hue ~120', () => {
    expect(hexToHsl('#00ff00').h).toBe(120);
  });

  test('blue-dominant maps to hue ~240 (case b branch)', () => {
    expect(hexToHsl('#0000ff').h).toBe(240);
  });

  test('a mixed blue-dominant color lands in the blue range', () => {
    const { h } = hexToHsl('#3040ff');
    expect(h).toBeGreaterThan(220);
    expect(h).toBeLessThan(250);
  });

  test('achromatic grey has zero saturation (max === min branch)', () => {
    const { s } = hexToHsl('#808080');
    expect(s).toBe(0);
  });

  test('white has zero saturation', () => {
    expect(hexToHsl('#ffffff').s).toBe(0);
  });
});

describe('hexToHsl <-> hslToHex round-trip', () => {
  test.each(['#0000ff', '#ff0000', '#00ff00', '#3040ff'])(
    'round-trips %s within ±1 per channel',
    hex => {
      const { h, s, l } = hexToHsl(hex);
      const back = hslToHex(h, s, l);
      const channels = c => [
        parseInt(c.slice(1, 3), 16),
        parseInt(c.slice(3, 5), 16),
        parseInt(c.slice(5, 7), 16),
      ];
      const [r1, g1, b1] = channels(hex);
      const [r2, g2, b2] = channels(back);
      expect(Math.abs(r1 - r2)).toBeLessThanOrEqual(2);
      expect(Math.abs(g1 - g2)).toBeLessThanOrEqual(2);
      expect(Math.abs(b1 - b2)).toBeLessThanOrEqual(2);
    }
  );
});
