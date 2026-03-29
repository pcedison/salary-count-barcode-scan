import '../test-utils/load-env';
import { sql } from '../db';
import { getBackupsList, getLiveDatabaseCounts, inspectBackupFileAtPath } from '../db-monitoring';

async function main() {
  const backups = getBackupsList();

  if (backups.length === 0) {
    console.log('[restore-check] No backup files found. Skipping restore validation.');
    return;
  }

  const latestBackup = backups[0];
  const inspection = inspectBackupFileAtPath(latestBackup.path, {
    backupId: latestBackup.id,
    backupType: latestBackup.type
  });
  const liveCounts = await getLiveDatabaseCounts();

  if (inspection.errors.length > 0) {
    console.error('[restore-check] Backup failed restore readiness validation.');
    console.error(
      JSON.stringify(
        {
          backupId: inspection.backupId,
          path: inspection.path,
          errors: inspection.errors,
          warnings: inspection.warnings
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  console.log('[restore-check] Latest backup passed restore readiness checks.');
  console.log(
    JSON.stringify(
      {
        backupId: inspection.backupId,
        type: inspection.backupType,
        path: inspection.path,
        metadata: inspection.metadata,
        backupCounts: inspection.counts,
        liveCounts,
        restoreOrder: inspection.restoreOrder,
        warnings: inspection.warnings
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error('[restore-check] Failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 1 });
  });
