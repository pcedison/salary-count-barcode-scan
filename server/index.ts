import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import {
  setupAutomaticBackups,
  startMonitoring,
  stopAutomaticBackups,
  stopMonitoring
} from './db-monitoring';
import { logOperation, OperationType } from './admin-auth';
import { loadCalculationRulesFromDb } from './services/calculationRulesLoader';
import { validateEnv } from './config/envValidator';
import { setupSecurity, setupTrustProxy } from './middleware/security';
import { setupAdminSession } from './session';
import { buildApiRequestLog, getApiRequestLogLevel } from './utils/httpLogging';
import { createLogger } from './utils/logger';

validateEnv();

const app = express();
const requestLog = createLogger('http');
const appLog = createLogger('server');
setupTrustProxy(app);
setupSecurity(app);
setupAdminSession(app);
// LINE webhook 需要 raw body 做 HMAC-SHA256 簽章驗證，必須在 express.json() 之前設定
app.use('/api/line/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const logLine = buildApiRequestLog(
        req.method,
        path,
        res.statusCode,
        duration,
        capturedJsonResponse
      );
      const level = getApiRequestLogLevel(res.statusCode);
      requestLog[level](logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    appLog.error('Unhandled request error', {
      status,
      method: _req.method,
      path: _req.path,
      message
    });

    // In production, do not expose internal error details to clients
    const isProduction = process.env.NODE_ENV === 'production';
    const clientMessage = isProduction && status >= 500 ? 'Internal Server Error' : message;
    res.status(status).json({ message: clientMessage });
    // 不再重新拋出錯誤，避免造成未捕獲的異常
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT) || 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);

    void loadCalculationRulesFromDb();
    const monitoringHandle = startMonitoring(60000); // 每分鐘檢查一次
    const backupHandle = setupAutomaticBackups();

    // LINE OAuth state 定時清理（每小時）
    if (process.env.LINE_LOGIN_CHANNEL_ID) {
      import('./storage').then(({ storage: store }) => {
        const lineCleanupHandle = setInterval(async () => {
          try {
            await store.cleanupExpiredOAuthStates();
          } catch (e) {
            appLog.warn('LINE OAuth state cleanup 失敗:', e);
          }
        }, 60 * 60 * 1000);
        server.once('close', () => clearInterval(lineCleanupHandle));
      });
    }

    server.once('close', () => {
      stopMonitoring(monitoringHandle);
      stopAutomaticBackups(backupHandle);
    });
    
    // 記錄系統啟動日誌
    logOperation(
      OperationType.SYSTEM_CONFIG,
      '系統啟動完成，資料庫監控與自動備份已設置',
      { success: true }
    );
  });
})();
