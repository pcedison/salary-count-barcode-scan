import { describe, expect, it } from 'vitest';

import {
  hashAdminPin,
  isHashedPin,
  verifyHashedAdminPin,
  verifyStoredAdminPin
} from './adminPinAuth';

describe('adminPinAuth', () => {
  it('supports legacy plaintext PIN verification', () => {
    expect(verifyStoredAdminPin('246810', '246810')).toBe(true);
    expect(verifyStoredAdminPin('246810', '123456')).toBe(false);
  });

  it('hashes a PIN and verifies the hashed format', () => {
    const hashedPin = hashAdminPin('246810');

    expect(isHashedPin(hashedPin)).toBe(true);
    expect(verifyHashedAdminPin(hashedPin, '246810')).toBe(true);
    expect(verifyHashedAdminPin(hashedPin, '123456')).toBe(false);
  });

  it('verifies stored PIN values regardless of plaintext or hashed format', () => {
    const hashedPin = hashAdminPin('135790');

    expect(verifyStoredAdminPin(hashedPin, '135790')).toBe(true);
    expect(verifyStoredAdminPin(hashedPin, '000000')).toBe(false);
  });
});
