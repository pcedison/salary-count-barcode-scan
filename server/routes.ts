import type { Express } from 'express';
import { createServer, type Server } from 'http';

import { registerDashboardRoutes } from './dashboard-routes';
import { registerAdminRoutes } from './routes/admin.routes';
import { registerAttendanceRoutes } from './routes/attendance.routes';
import { registerEmployeeRoutes } from './routes/employees.routes';
import { registerHealthRoutes } from './routes/health.routes';
import { registerHolidayRoutes } from './routes/holidays.routes';
import { registerImportRoutes } from './routes/import.routes';
import { registerSalaryRoutes } from './routes/salary.routes';
import { registerScanRoutes } from './routes/scan.routes';
import { registerSettingsRoutes } from './routes/settings.routes';
import { registerLineRoutes } from './routes/line.routes';
import { createLogger } from './utils/logger';

const log = createLogger('routes');

export async function registerRoutes(app: Express): Promise<Server> {
  log.info('初始化 PostgreSQL 存儲實現');

  registerDashboardRoutes(app);
  registerAdminRoutes(app);
  registerAttendanceRoutes(app);
  registerEmployeeRoutes(app);
  registerHealthRoutes(app);
  registerHolidayRoutes(app);
  registerImportRoutes(app);
  registerSalaryRoutes(app);
  registerScanRoutes(app);
  registerSettingsRoutes(app);

  // LINE 打卡功能：僅在 LINE 環境變數設定時啟用
  if (process.env.LINE_LOGIN_CHANNEL_ID) {
    registerLineRoutes(app);
    log.info('LINE 打卡功能已啟用');
  } else {
    log.warn('LINE 打卡功能未啟用（LINE 環境變數未設定）');
  }

  const httpServer = createServer(app);
  return httpServer;
}
