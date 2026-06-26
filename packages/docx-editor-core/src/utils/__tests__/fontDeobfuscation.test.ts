import { describe, test, expect } from 'bun:test';
import { deobfuscateFont, isValidFontKey } from '../fontDeobfuscation';

// Spec example GUID (ECMA-376 Part 4 §2.8.1). Reversed byte order is the key:
//   001B70DC-AA60-4AD5-90EC-18A0948E1EAE
//   -> AE 1E 8E 94 A0 18 EC 90 D5 4A 60 AA DC 70 1B 00
const GUID = '001B70DC-AA60-4AD5-90EC-18A0948E1EAE';
const REVERSED_KEY = [
  0xae, 0x1e, 0x8e, 0x94, 0xa0, 0x18, 0xec, 0x90, 0xd5, 0x4a, 0x60, 0xaa, 0xdc, 0x70, 0x1b, 0x00,
];

function bytes(buf: ArrayBuffer): number[] {
  return Array.from(new Uint8Array(buf));
}

describe('deobfuscateFont', () => {
  test('XORs the first 32 bytes with the reversed GUID key (twice)', () => {
    // If the de-obfuscated header is all zeros, the obfuscated bytes are exactly
    // the reversed key repeated across both 16-byte halves. This pins the byte
    // ordering (reversed, not raw) — a raw-order key would fail here.
    const obfuscated = new Uint8Array(40);
    obfuscated.set([...REVERSED_KEY, ...REVERSED_KEY], 0);
    // Tail bytes past offset 32 carry a recognizable pattern.
    obfuscated.set([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88], 32);

    const out = bytes(deobfuscateFont(obfuscated.buffer, GUID));

    expect(out.slice(0, 32)).toEqual(new Array(32).fill(0));
    // Everything after the 32-byte header is untouched.
    expect(out.slice(32)).toEqual([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
  });

  test('recovers a TrueType signature (00 01 00 00) at the start', () => {
    const header = new Uint8Array(32);
    header.set([0x00, 0x01, 0x00, 0x00], 0); // sfnt version for TrueType
    const obfuscated = new Uint8Array(32);
    for (let i = 0; i < 32; i++) obfuscated[i] = header[i] ^ REVERSED_KEY[i % 16];

    const out = new Uint8Array(deobfuscateFont(obfuscated.buffer, GUID));
    expect(Array.from(out.slice(0, 4))).toEqual([0x00, 0x01, 0x00, 0x00]);
  });

  test('is its own inverse (XOR symmetry)', () => {
    const original = new Uint8Array(64);
    for (let i = 0; i < 64; i++) original[i] = (i * 7 + 3) & 0xff;
    const once = deobfuscateFont(original.buffer as ArrayBuffer, GUID);
    const twice = deobfuscateFont(once, GUID);
    expect(bytes(twice)).toEqual(Array.from(original));
  });

  test('accepts a bare GUID without braces or hyphens', () => {
    const obfuscated = new Uint8Array([...REVERSED_KEY, ...REVERSED_KEY]);
    const out = bytes(deobfuscateFont(obfuscated.buffer, '001B70DCAA604AD590EC18A0948E1EAE'));
    expect(out.slice(0, 32)).toEqual(new Array(32).fill(0));
  });

  test('accepts a brace-wrapped GUID', () => {
    const obfuscated = new Uint8Array([...REVERSED_KEY, ...REVERSED_KEY]);
    const out = bytes(deobfuscateFont(obfuscated.buffer, `{${GUID}}`));
    expect(out.slice(0, 32)).toEqual(new Array(32).fill(0));
  });

  test('does not mutate the input buffer', () => {
    const obfuscated = new Uint8Array([...REVERSED_KEY, ...REVERSED_KEY]);
    const snapshot = Array.from(obfuscated);
    deobfuscateFont(obfuscated.buffer, GUID);
    expect(Array.from(obfuscated)).toEqual(snapshot);
  });

  test('throws on a malformed key', () => {
    const buf = new Uint8Array(32).buffer;
    expect(() => deobfuscateFont(buf, 'not-a-guid')).toThrow();
  });

  test('handles fonts shorter than 32 bytes without overrunning', () => {
    const obfuscated = new Uint8Array(REVERSED_KEY.slice(0, 10));
    const out = bytes(deobfuscateFont(obfuscated.buffer, GUID));
    expect(out).toEqual(new Array(10).fill(0));
  });
});

describe('isValidFontKey', () => {
  test('accepts braced, hyphenated, and bare 32-hex forms', () => {
    expect(isValidFontKey(`{${GUID}}`)).toBe(true);
    expect(isValidFontKey(GUID)).toBe(true);
    expect(isValidFontKey('001B70DCAA604AD590EC18A0948E1EAE')).toBe(true);
  });

  test('rejects wrong length and non-hex', () => {
    expect(isValidFontKey('')).toBe(false);
    expect(isValidFontKey('1234')).toBe(false);
    expect(isValidFontKey('ZZ1B70DC-AA60-4AD5-90EC-18A0948E1EAE')).toBe(false);
    expect(isValidFontKey(undefined)).toBe(false);
  });
});
