import { afterEach, describe, expect, it } from 'vitest';

import { caesarEncrypt } from '@shared/utils/caesarCipher';
import { encrypt as encryptAes } from '@shared/utils/encryption';

import {
  getEmployeeDisplayId,
  getEmployeeScanId,
  matchesEmployeeIdentity,
  normalizeEmployeeIdentity
} from './employeeIdentity';

const TEST_ENCRYPTION_KEY = '12345678901234567890123456789012';

describe('employeeIdentity', () => {
  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('normalizes employee identities to trimmed uppercase values', () => {
    expect(normalizeEmployeeIdentity(' a123456789 ')).toBe('A123456789');
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
});
