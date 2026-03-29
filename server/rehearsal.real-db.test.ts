import fs from 'fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BackupType, createDatabaseBackup, rehearseRestoreFromBackup } from './db-monitoring';
import { storage } from './storage';

const execFileAsync = promisify(execFile);
const TEST_PREFIX = `__rehearsal_${Date.now()}`;
const TEST_AES_KEY = '12345678901234567890123456789012';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const trackedEmployeeIds: number[] = [];

async function cleanup() {
  for (const employeeId of trackedEmployeeIds) {
    try {
      await storage.deleteTemporaryAttendanceByEmployeeId(employeeId);
    } catch {
      // ignore cleanup noise
    }

    try {
      await storage.deleteEmployee(employeeId);
    } catch {
      // ignore cleanup noise
    }
  }
}

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for rehearsal real DB tests');
  }
});

afterAll(async () => {
  await cleanup();
});

describe('real database — rollback / restore rehearsals', () => {
  it('rehearses restore from a fresh manual backup and restores backup counts inside the transaction', async () => {
    const backupId = await createDatabaseBackup(BackupType.MANUAL, `${TEST_PREFIX} restore rehearsal`);

    const result = await rehearseRestoreFromBackup(backupId, BackupType.MANUAL);

    expect(result.rehearsalRolledBack).toBe(true);
    expect(result.backupCounts).toEqual(result.restoredCountsInTransaction);
  });

  it('runs AES rehearsal for a filtered employee set and leaves stored values unchanged', async () => {
    const employee = await storage.createEmployee({
      name: `${TEST_PREFIX}_aes_rehearse`,
      idNumber: `${TEST_PREFIX}_AES_REHEARSE`,
      position: 'QA',
      department: 'QA',
      active: true
    });
    trackedEmployeeIds.push(employee.id);

    const originalEmployee = await storage.getEmployeeById(employee.id);
    const { stdout } = await execFileAsync(
      'node',
      ['scripts/migrate-to-aes.mjs', '--rehearse', `--employee-id=${employee.id}`],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ENCRYPTION_KEY: TEST_AES_KEY
        }
      }
    );

    const employeeAfter = await storage.getEmployeeById(employee.id);

    expect(stdout).toContain('Rehearsal summary');
    expect(stdout).toContain('"rehearsalRolledBack": true');
    expect(employeeAfter?.idNumber).toBe(originalEmployee?.idNumber);
    expect(employeeAfter?.isEncrypted).toBe(originalEmployee?.isEncrypted);
  });

  it('creates an AES snapshot for a filtered employee set without changing stored values', async () => {
    const employee = await storage.createEmployee({
      name: `${TEST_PREFIX}_aes_snapshot`,
      idNumber: `${TEST_PREFIX}_AES_SNAPSHOT`,
      position: 'QA',
      department: 'QA',
      active: true
    });
    trackedEmployeeIds.push(employee.id);

    const originalEmployee = await storage.getEmployeeById(employee.id);
    const { stdout } = await execFileAsync(
      'node',
      ['scripts/migrate-to-aes.mjs', '--snapshot', `--employee-id=${employee.id}`],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ENCRYPTION_KEY: TEST_AES_KEY
        }
      }
    );

    const snapshotLine = stdout
      .split('\n')
      .find((line) => line.startsWith('Snapshot saved: '));

    expect(snapshotLine).toBeDefined();

    const snapshotPath = snapshotLine?.replace('Snapshot saved: ', '').trim();
    expect(snapshotPath).toBeTruthy();
    expect(fs.existsSync(snapshotPath)).toBe(true);

    const snapshotContent = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    expect(snapshotContent).toEqual([
      expect.objectContaining({
        id: employee.id,
        name: employee.name,
        idNumber: originalEmployee?.idNumber,
        isEncrypted: originalEmployee?.isEncrypted
      })
    ]);

    const employeeAfter = await storage.getEmployeeById(employee.id);
    expect(employeeAfter?.idNumber).toBe(originalEmployee?.idNumber);
    expect(employeeAfter?.isEncrypted).toBe(originalEmployee?.isEncrypted);
  });

  it(
    'reports AES migration readiness after full-scope evidence is regenerated',
    async () => {
      await cleanup();
      trackedEmployeeIds.length = 0;

      await execFileAsync(npmCommand, ['run', 'aes:report'], {
        cwd: process.cwd(),
        env: {
        ...process.env,
        ENCRYPTION_KEY: TEST_AES_KEY
      },
      maxBuffer: 2 * 1024 * 1024
    });
    await execFileAsync(npmCommand, ['run', 'aes:snapshot'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ENCRYPTION_KEY: TEST_AES_KEY
      },
      maxBuffer: 2 * 1024 * 1024
    });
    await execFileAsync(npmCommand, ['run', 'aes:rehearse'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ENCRYPTION_KEY: TEST_AES_KEY
      },
      maxBuffer: 2 * 1024 * 1024
    });
    await execFileAsync(npmCommand, ['run', 'restore:rehearse'], {
      cwd: process.cwd(),
      env: {
        ...process.env
      },
      maxBuffer: 2 * 1024 * 1024
    });

    const { stdout } = await execFileAsync(npmCommand, ['run', 'aes:ready'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ENCRYPTION_KEY: TEST_AES_KEY
      },
      maxBuffer: 2 * 1024 * 1024
    });

      expect(stdout).toContain('Ready for execute: YES');
      expect(stdout).toContain('Status report saved: ');
    },
    30000
  );
});
