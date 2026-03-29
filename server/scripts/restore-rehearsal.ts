import fs from 'fs';
import path from 'path';

import '../test-utils/load-env';
import { sql } from '../db';
import { BackupType, getBackupsList, rehearseRestoreFromBackup } from '../db-monitoring';

const REPORT_DIR = path.join(process.cwd(), 'backups', 'restore-rehearsal', 'reports');

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readArgValue(flag: string): string | undefined {
  for (let index = 0; index < process.argv.length; index += 1) {
    const arg = process.argv[index];

    if (arg === flag) {
      return process.argv[index + 1];
    }

    if (arg.startsWith(`${flag}=`)) {
      return arg.slice(flag.length + 1);
    }
  }

  return undefined;
}

function normalizeBackupType(value?: string): BackupType | undefined {
  if (!value) {
    return undefined;
  }

  switch (value) {
    case BackupType.DAILY:
    case BackupType.WEEKLY:
    case BackupType.MONTHLY:
    case BackupType.MANUAL:
      return value;
    default:
      throw new Error(`不支援的 backup type：${value}`);
  }
}

async function main() {
  const requestedBackupId = readArgValue('--backup-id');
  const requestedBackupType = normalizeBackupType(readArgValue('--type'));
  const backups = getBackupsList(requestedBackupType);

  if (backups.length === 0) {
    console.log('[restore-rehearsal] No backup files found. Skipping rehearsal.');
    return;
  }

  const selectedBackup = requestedBackupId
    ? backups.find((backup) => backup.id === requestedBackupId)
    : backups[0];

  if (!selectedBackup) {
    throw new Error(`找不到指定備份：${requestedBackupId}`);
  }

  const result = await rehearseRestoreFromBackup(selectedBackup.id, selectedBackup.type);

  ensureDirectory(REPORT_DIR);

  const reportPath = path.join(
    REPORT_DIR,
    `restore-rehearsal-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      mode: 'restore-rehearsal',
      databaseType: 'postgres',
      rehearsalRolledBack: result.rehearsalRolledBack
    },
    result
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('[restore-rehearsal] Completed and rolled back successfully.');
  console.log(
    JSON.stringify(
      {
        backupId: result.backupId,
        type: result.backupType,
        path: result.path,
        backupCounts: result.backupCounts,
        liveCountsBefore: result.liveCountsBefore,
        restoredCountsInTransaction: result.restoredCountsInTransaction,
        warnings: result.warnings,
        reportPath
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error('[restore-rehearsal] Failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 1 });
  });
