import { caesarDecrypt, caesarEncrypt, isEncrypted as isCaesarEncrypted } from '@shared/utils/caesarCipher';
import { decrypt as decryptAes, encrypt as encryptAes, isAESEncrypted } from '@shared/utils/encryption';

import { createLogger } from './logger';

const log = createLogger('identity');

type EmployeeIdentityLike = {
  idNumber: string;
  isEncrypted?: boolean | null;
};

export function normalizeEmployeeIdentity(value: string): string {
  return value.trim().toUpperCase();
}

export function maskEmployeeIdentityForLog(rawIdNumber: string): string {
  const trimmedId = rawIdNumber.trim();

  if (!trimmedId) {
    return '[empty-id]';
  }

  let displayId = normalizeEmployeeIdentity(trimmedId);

  try {
    if (isAESEncrypted(trimmedId)) {
      displayId = normalizeEmployeeIdentity(decryptAes(trimmedId));
    } else if (isCaesarEncrypted(displayId)) {
      displayId = normalizeEmployeeIdentity(caesarDecrypt(displayId));
    }
  } catch {
    return `[protected-id:${trimmedId.length}]`;
  }

  if (displayId.length <= 4) {
    return `${displayId.slice(0, 1)}***${displayId.slice(-1)}`;
  }

  return `${displayId.slice(0, 2)}${'*'.repeat(displayId.length - 4)}${displayId.slice(-2)}`;
}

export function isAesWriteEnabled(): boolean {
  return process.env.USE_AES_ENCRYPTION === 'true' && Boolean(process.env.ENCRYPTION_KEY);
}

function maybeDecryptInputIdentity(rawIdNumber: string): string {
  const trimmedId = rawIdNumber.trim();
  const normalizedId = normalizeEmployeeIdentity(trimmedId);

  if (!trimmedId) {
    return '';
  }

  try {
    if (isAESEncrypted(trimmedId)) {
      return normalizeEmployeeIdentity(decryptAes(trimmedId));
    }

    if (isCaesarEncrypted(normalizedId)) {
      return normalizeEmployeeIdentity(caesarDecrypt(normalizedId));
    }
  } catch (error) {
    log.error('掃碼身分證號碼解密失敗:', error);
  }

  return normalizedId;
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
    log.error('身分證號碼解密失敗:', error);
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

export function buildEmployeeIdentityLookupCandidates(rawIdNumber: string): string[] {
  const trimmedId = rawIdNumber.trim();
  if (!trimmedId) {
    return [];
  }

  const normalizedId = normalizeEmployeeIdentity(trimmedId);
  const displayId = maybeDecryptInputIdentity(trimmedId);
  const scanId = displayId ? caesarEncrypt(displayId) : '';

  const candidates = new Set<string>();

  candidates.add(trimmedId);

  if (normalizedId !== trimmedId) {
    candidates.add(normalizedId);
  }

  if (isAESEncrypted(trimmedId)) {
    candidates.add(trimmedId.toLowerCase());
  }

  if (displayId) {
    candidates.add(displayId);
  }

  if (scanId) {
    candidates.add(scanId);
  }

  return Array.from(candidates).filter(Boolean);
}

export function encryptEmployeeIdentityForStorage(
  idNumber: string,
  shouldEncrypt: boolean
): string {
  const normalizedId = normalizeEmployeeIdentity(idNumber);

  if (!normalizedId || !shouldEncrypt) {
    return normalizedId;
  }

  if (isAesWriteEnabled()) {
    return encryptAes(normalizedId);
  }

  return caesarEncrypt(normalizedId);
}

export function prepareUpdatedEmployeeIdentityForStorage(options: {
  currentEmployee: EmployeeIdentityLike;
  nextIdNumber?: string | null;
  shouldEncrypt: boolean;
}): string {
  const { currentEmployee, nextIdNumber, shouldEncrypt } = options;
  const currentStoredId = (currentEmployee.idNumber || '').trim();
  const currentDisplayId = getEmployeeDisplayId(currentEmployee);
  const hasExplicitIdUpdate = typeof nextIdNumber === 'string';
  const nextDisplayId = hasExplicitIdUpdate
    ? normalizeEmployeeIdentity(nextIdNumber || '')
    : currentDisplayId;

  if (!nextDisplayId) {
    return nextDisplayId;
  }

  if (!shouldEncrypt) {
    return nextDisplayId;
  }

  if (
    currentEmployee.isEncrypted &&
    nextDisplayId === currentDisplayId &&
    currentStoredId
  ) {
    return currentStoredId;
  }

  return encryptEmployeeIdentityForStorage(nextDisplayId, true);
}

export function matchesEmployeeIdentity(
  employee: EmployeeIdentityLike,
  rawIdNumber: string
): boolean {
  const inputCandidates = new Set(buildEmployeeIdentityLookupCandidates(rawIdNumber).map(normalizeEmployeeIdentity));
  if (inputCandidates.size === 0) {
    return false;
  }

  const storedId = normalizeEmployeeIdentity(employee.idNumber || '');
  const displayId = getEmployeeDisplayId(employee);
  const scanId = getEmployeeScanId(employee);

  return [storedId, displayId, scanId].some((candidate) =>
    inputCandidates.has(normalizeEmployeeIdentity(candidate))
  );
}
