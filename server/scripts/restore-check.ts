import fs from 'fs';
import path from 'path';

type BackupPayload = {
  metadata?: {
    timestamp?: string;
    type?: string;
    version?: string;
  };
  employees?: unknown[];
  holidays?: unknown[];
  salaryRecords?: unknown[];
  temporaryAttendance?: unknown[];
};

type BackupFile = {
  id: string;
  timestamp: number;
  type: 'daily' | 'weekly' | 'monthly' | 'manual';
  path: string;
};

function getBackupDirectories() {
  const backupRoot = path.join(process.cwd(), 'backups');

  return [
    { type: 'daily' as const, dir: path.join(backupRoot, 'daily') },
    { type: 'weekly' as const, dir: path.join(backupRoot, 'weekly') },
    { type: 'monthly' as const, dir: path.join(backupRoot, 'monthly') },
    { type: 'manual' as const, dir: path.join(backupRoot, 'manual') }
  ];
}

function getBackupFiles(): BackupFile[] {
  const backups: BackupFile[] = [];

  for (const { type, dir } of getBackupDirectories()) {
    if (!fs.existsSync(dir)) {
      continue;
    }

    const files = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => {
        const filePath = path.join(dir, file);
        return {
          id: file.replace(/\.json$/, ''),
          timestamp: fs.statSync(filePath).mtime.getTime(),
          type,
          path: filePath
        };
      });

    backups.push(...files);
  }

  return backups.sort((left, right) => right.timestamp - left.timestamp);
}

async function main() {
  const backups = getBackupFiles();

  if (backups.length === 0) {
    console.log('[restore-check] No backup files found. Skipping restore validation.');
    return;
  }

  const latestBackup = backups[0];
  const rawBackup = fs.readFileSync(latestBackup.path, 'utf8');
  const parsedBackup = JSON.parse(rawBackup) as BackupPayload;

  const summary = {
    backupId: latestBackup.id,
    type: latestBackup.type,
    path: latestBackup.path,
    metadata: parsedBackup.metadata || null,
    employees: Array.isArray(parsedBackup.employees) ? parsedBackup.employees.length : 0,
    holidays: Array.isArray(parsedBackup.holidays) ? parsedBackup.holidays.length : 0,
    salaryRecords: Array.isArray(parsedBackup.salaryRecords) ? parsedBackup.salaryRecords.length : 0,
    temporaryAttendance: Array.isArray(parsedBackup.temporaryAttendance)
      ? parsedBackup.temporaryAttendance.length
      : 0
  };

  console.log('[restore-check] Latest backup parsed successfully.');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('[restore-check] Failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
