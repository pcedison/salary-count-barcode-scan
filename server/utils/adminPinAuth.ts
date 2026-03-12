import crypto from 'crypto';

const HASH_SEPARATOR = ':';

export function isHashedPin(value: string): boolean {
  if (!value || !value.includes(HASH_SEPARATOR)) {
    return false;
  }

  const [salt, hash] = value.split(HASH_SEPARATOR);
  return Boolean(salt && hash);
}

export function hashAdminPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(pin, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyHashedAdminPin(storedHash: string, providedPin: string): boolean {
  const [salt, hash] = storedHash.split(HASH_SEPARATOR);

  if (!salt || !hash) {
    return false;
  }

  const providedHash = crypto.pbkdf2Sync(providedPin, salt, 1000, 64, 'sha512').toString('hex');
  return hash === providedHash;
}

export function verifyStoredAdminPin(storedPin: string, providedPin: string): boolean {
  if (!storedPin || !providedPin) {
    return false;
  }

  if (isHashedPin(storedPin)) {
    return verifyHashedAdminPin(storedPin, providedPin);
  }

  return storedPin === providedPin;
}
