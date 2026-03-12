import { caesarDecrypt, caesarEncrypt, isEncrypted as isCaesarEncrypted } from '@shared/utils/caesarCipher';
import { decrypt as decryptAes, isAESEncrypted } from '@shared/utils/encryption';

type EmployeeIdentityLike = {
  idNumber: string;
  isEncrypted?: boolean | null;
};

export function normalizeEmployeeIdentity(value: string): string {
  return value.trim().toUpperCase();
}

function decryptProtectedIdentity(idNumber: string, isEncryptedHint = false): string {
  const normalizedId = normalizeEmployeeIdentity(idNumber);

  if (!normalizedId) {
    return '';
  }

  try {
    if (isAESEncrypted(normalizedId)) {
      return normalizeEmployeeIdentity(decryptAes(normalizedId));
    }

    if (isEncryptedHint || isCaesarEncrypted(normalizedId)) {
      return normalizeEmployeeIdentity(caesarDecrypt(normalizedId));
    }
  } catch (error) {
    console.error('身分證號碼解密失敗:', error);
  }

  return normalizedId;
}

export function getEmployeeDisplayId(employee: EmployeeIdentityLike): string {
  const normalizedStoredId = normalizeEmployeeIdentity(employee.idNumber || '');

  if (!normalizedStoredId) {
    return '';
  }

  if (employee.isEncrypted || isAESEncrypted(normalizedStoredId) || isCaesarEncrypted(normalizedStoredId)) {
    return decryptProtectedIdentity(normalizedStoredId, employee.isEncrypted === true);
  }

  return normalizedStoredId;
}

export function getEmployeeScanId(employee: EmployeeIdentityLike): string {
  const displayId = getEmployeeDisplayId(employee);

  if (!displayId) {
    return '';
  }

  return caesarEncrypt(displayId);
}

export function matchesEmployeeIdentity(
  employee: EmployeeIdentityLike,
  rawIdNumber: string
): boolean {
  const normalizedInput = normalizeEmployeeIdentity(rawIdNumber);

  if (!normalizedInput) {
    return false;
  }

  const storedId = normalizeEmployeeIdentity(employee.idNumber || '');
  const displayId = getEmployeeDisplayId(employee);
  const scanId = getEmployeeScanId(employee);

  return [storedId, displayId, scanId].some((candidate) => candidate === normalizedInput);
}
