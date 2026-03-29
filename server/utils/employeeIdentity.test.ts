import { afterEach, describe, expect, it } from 'vitest';

import { caesarEncrypt } from '@shared/utils/caesarCipher';
import { decrypt as decryptAes, encrypt as encryptAes, isAESEncrypted } from '@shared/utils/encryption';

import {
  buildEmployeeIdentityLookupCandidates,
  encryptEmployeeIdentityForStorage,
  getEmployeeDisplayId,
  getEmployeeScanId,
  isAesWriteEnabled,
  maskEmployeeIdentityForLog,
  matchesEmployeeIdentity,
  normalizeEmployeeIdentity,
  prepareUpdatedEmployeeIdentityForStorage
} from './employeeIdentity';

const TEST_ENCRYPTION_KEY = '12345678901234567890123456789012';

describe('employeeIdentity', () => {
  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    delete process.env.USE_AES_ENCRYPTION;
  });

  it('normalizes employee identities to trimmed uppercase values', () => {
    expect(normalizeEmployeeIdentity(' a123456789 ')).toBe('A123456789');
  });

  it('builds direct lookup candidates for plaintext, Caesar, and AES inputs', () => {
    process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    const aesId = encryptAes('A123456789');

    expect(buildEmployeeIdentityLookupCandidates('A123456789')).toEqual([
      'A123456789',
      caesarEncrypt('A123456789')
    ]);
    expect(buildEmployeeIdentityLookupCandidates(caesarEncrypt('A123456789'))).toEqual([
      caesarEncrypt('A123456789'),
      caesarEncrypt(caesarEncrypt('A123456789'))
    ]);
    expect(buildEmployeeIdentityLookupCandidates(aesId)).toEqual([
      aesId,
      aesId.toUpperCase(),
      'A123456789',
      caesarEncrypt('A123456789')
    ]);
  });

  it('returns display ids and scan ids for plaintext and Caesar-encrypted employees', () => {
    const plainEmployee = {
      idNumber: 'a123456789',
      isEncrypted: false
    };
    const caesarEmployee = {
      idNumber: caesarEncrypt('A123456789'),
      isEncrypted: true
    };

    expect(getEmployeeDisplayId(plainEmployee)).toBe('A123456789');
    expect(getEmployeeScanId(plainEmployee)).toBe(caesarEncrypt('A123456789'));
    expect(getEmployeeDisplayId(caesarEmployee)).toBe('A123456789');
    expect(getEmployeeScanId(caesarEmployee)).toBe(caesarEncrypt('A123456789'));
  });

  it('supports AES-encrypted employee ids for display and scan matching', () => {
    process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    const aesId = encryptAes('A123456789');
    const aesEmployee = {
      idNumber: aesId,
      isEncrypted: true
    };

    expect(getEmployeeDisplayId(aesEmployee)).toBe('A123456789');
    expect(getEmployeeScanId(aesEmployee)).toBe(caesarEncrypt('A123456789'));
    expect(matchesEmployeeIdentity(aesEmployee, 'A123456789')).toBe(true);
    expect(matchesEmployeeIdentity(aesEmployee, caesarEncrypt('A123456789'))).toBe(true);
    expect(matchesEmployeeIdentity(aesEmployee, aesId)).toBe(true);
  });

  it('masks plaintext and encrypted employee identities before logging', () => {
    process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    const aesId = encryptAes('A123456789');
    const caesarId = caesarEncrypt('A123456789');

    expect(maskEmployeeIdentityForLog('A123456789')).toBe('A1******89');
    expect(maskEmployeeIdentityForLog(caesarId)).not.toBe(caesarId);
    expect(maskEmployeeIdentityForLog(caesarId)).toContain('*');
    expect(maskEmployeeIdentityForLog(aesId)).toBe('A1******89');
  });

  it('uses feature-flagged AES writes and preserves existing encrypted values when the id is unchanged', () => {
    process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    process.env.USE_AES_ENCRYPTION = 'true';

    const aesStoredId = encryptEmployeeIdentityForStorage('A123456789', true);
    const aesEmployee = {
      idNumber: aesStoredId,
      isEncrypted: true
    };

    expect(isAesWriteEnabled()).toBe(true);
    expect(aesStoredId).not.toBe(caesarEncrypt('A123456789'));
    expect(prepareUpdatedEmployeeIdentityForStorage({
      currentEmployee: aesEmployee,
      nextIdNumber: 'A123456789',
      shouldEncrypt: true
    })).toBe(aesStoredId);
  });

  it('re-encrypts changed ids with AES when the feature flag is enabled', () => {
    process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    process.env.USE_AES_ENCRYPTION = 'true';

    const nextStoredId = prepareUpdatedEmployeeIdentityForStorage({
      currentEmployee: {
        idNumber: caesarEncrypt('A123456789'),
        isEncrypted: true
      },
      nextIdNumber: 'A123456780',
      shouldEncrypt: true
    });

    expect(isAESEncrypted(nextStoredId)).toBe(true);
    expect(decryptAes(nextStoredId)).toBe('A123456780');
  });

  it('falls back to Caesar writes without AES configuration and can decrypt when encryption is disabled', () => {
    const caesarStoredId = encryptEmployeeIdentityForStorage('A123456789', true);

    expect(isAesWriteEnabled()).toBe(false);
    expect(caesarStoredId).toBe(caesarEncrypt('A123456789'));
    expect(prepareUpdatedEmployeeIdentityForStorage({
      currentEmployee: {
        idNumber: caesarStoredId,
        isEncrypted: true
      },
      shouldEncrypt: false
    })).toBe('A123456789');
  });
});
