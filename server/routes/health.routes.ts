import type { Express } from 'express';

import { db } from '../db';

const SERVER_START_TIME = Date.now();

type ProbeResult = {
  status: 'pass' | 'fail';
  responseTimeMs?: number;
  message?: string;
};

function setNoStoreHeaders(res: {
  set: (field: string, value: string) => unknown;
}): void {
  res.set('Cache-Control', 'no-store');
}

function getUptimeSeconds(): number {
  return Math.floor((Date.now() - SERVER_START_TIME) / 1000);
}

function buildMemoryCheck(): ProbeResult & {
  heapUsedMb: number;
  heapTotalMb: number;
  usagePercent: number;
} {
  const memoryUsage = process.memoryUsage();
  const heapUsedMb = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  const heapTotalMb = Math.round(memoryUsage.heapTotal / 1024 / 1024);
  const usagePercent = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);

  return {
    status: usagePercent > 90 ? 'fail' : 'pass',
    message:
      usagePercent > 90
        ? `Memory usage critical: ${heapUsedMb}/${heapTotalMb}MB (${usagePercent}%)`
        : `Memory usage normal: ${heapUsedMb}/${heapTotalMb}MB (${usagePercent}%)`,
    heapUsedMb,
    heapTotalMb,
    usagePercent
  };
}

async function runDatabaseCheck(): Promise<ProbeResult> {
  const start = Date.now();

  try {
    await db.execute('SELECT 1');
    return {
      status: 'pass',
      responseTimeMs: Date.now() - start,
      message: 'Database connection successful'
    };
  } catch (error) {
    return {
      status: 'fail',
      responseTimeMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown database error'
    };
  }
}

export function registerHealthRoutes(app: Express): void {
  app.get('/api/health', async (_req, res) => {
    setNoStoreHeaders(res);
    const database = await runDatabaseCheck();
    const memory = buildMemoryCheck();
    const isHealthy = database.status === 'pass' && memory.status === 'pass';

    return res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: getUptimeSeconds(),
      version: process.env.npm_package_version || '1.0.0',
      checks: {
        database,
        memory
      }
    });
  });

  app.get('/ready', async (_req, res) => {
    setNoStoreHeaders(res);
    const database = await runDatabaseCheck();
    const ready = database.status === 'pass';

    return res.status(ready ? 200 : 503).json({
      ready,
      timestamp: new Date().toISOString(),
      checks: {
        database
      }
    });
  });

  app.get('/live', (_req, res) => {
    setNoStoreHeaders(res);
    return res.json({
      alive: true,
      timestamp: new Date().toISOString(),
      uptimeSeconds: getUptimeSeconds()
    });
  });
}
