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

export async function registerRoutes(app: Express): Promise<Server> {
  console.log('初始化數據庫並確定存儲實現...');
  console.log('使用PostgreSQL存儲實現');

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

  const httpServer = createServer(app);
  return httpServer;
}
