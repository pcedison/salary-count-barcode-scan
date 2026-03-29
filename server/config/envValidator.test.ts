import { afterEach, describe, expect, it, vi } from 'vitest';

import { validateEnv } from './envValidator';

const ORIGINAL_ENV = { ...process.env };

function buildEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    ...ORIGINAL_ENV,
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://user:pass@localhost:5432/app',
    ...overrides
  };
}

describe('validateEnv', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('allows test defaults without session or encryption secrets', () => {
    process.env = buildEnv();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const validated = validateEnv();

    expect(validated.NODE_ENV).toBe('test');
    // 3 warnings: SESSION_SECRET、ENCRYPTION_KEY、LINE 未設定
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  it('rejects AES write mode when ENCRYPTION_KEY is missing', () => {
    process.env = buildEnv({
      USE_AES_ENCRYPTION: 'true',
      ENCRYPTION_KEY: undefined
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => validateEnv()).toThrow(
      'USE_AES_ENCRYPTION=true 時必須設定至少 32 字元的 ENCRYPTION_KEY'
    );
  });

  it('rejects insecure SameSite=None session cookies', () => {
    process.env = buildEnv({
      SESSION_SAME_SITE: 'none',
      SESSION_SECURE: 'false'
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => validateEnv()).toThrow(
      'SESSION_SAME_SITE=none 時必須同時啟用 SESSION_SECURE=true'
    );
  });

  it('requires SESSION_SECRET in production', () => {
    process.env = buildEnv({
      NODE_ENV: 'production',
      SESSION_SECRET: undefined
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => validateEnv()).toThrow(
      'production 環境必須設定至少 32 字元的 SESSION_SECRET'
    );
  });
});
