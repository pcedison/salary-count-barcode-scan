import crypto from 'crypto';
import type { Express } from 'express';

import { storage } from '../storage';
import { requireAdmin } from '../middleware/requireAdmin';
import { createLogger } from '../utils/logger';
import {
  isLineConfigured,
  getLineLoginUrl,
  exchangeCodeForToken,
  getLineProfile,
  verifyWebhookSignature,
  sendClockInNotification
} from '../services/line.service';
import { handleRouteError } from './route-helpers';
import { getTaiwanDateTimeParts } from './scan-helpers';
import { normalizeDateToSlash } from '@shared/utils/specialLeaveSync';

const log = createLogger('line-routes');

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 分鐘

export function registerLineRoutes(app: Express): void {

  // GET /api/line/config — 回傳 LINE 是否設定好（供前端判斷是否顯示 LINE 功能）
  app.get('/api/line/config', (_req, res) => {
    res.json({ configured: isLineConfigured() });
  });

  // GET /api/line/login — 重導至 LINE OAuth 授權頁
  app.get('/api/line/login', async (req, res) => {
    if (!isLineConfigured()) {
      return res.status(503).json({ error: 'LINE 打卡功能尚未設定' });
    }

    try {
      const state = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);

      await storage.createOAuthState({ state, expiresAt });

      const loginUrl = getLineLoginUrl(state);
      return res.redirect(loginUrl);
    } catch (err) {
      log.error('LINE login redirect 失敗:', err);
      return handleRouteError(err, res);
    }
  });

  // GET /api/line/callback — LINE OAuth callback
  app.get('/api/line/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query as Record<string, string>;

    if (error) {
      log.warn(`LINE OAuth 錯誤: ${error} - ${error_description}`);
      return res.redirect('/clock-in?error=line_auth_failed');
    }

    if (!code || !state) {
      return res.redirect('/clock-in?error=missing_params');
    }

    try {
      // 驗證 state
      const storedState = await storage.getOAuthState(state);
      if (!storedState) {
        return res.redirect('/clock-in?error=invalid_state');
      }
      if (new Date() > storedState.expiresAt) {
        await storage.deleteOAuthState(state);
        return res.redirect('/clock-in?error=state_expired');
      }
      await storage.deleteOAuthState(state);

      // 換取 access token 並取得 LINE profile
      const tokenData = await exchangeCodeForToken(code);
      const profile = await getLineProfile(tokenData.access_token);

      // 將 LINE 資料存入 session（one-time，ClockInPage 取出後清除）
      req.session.lineTemp = {
        lineUserId: profile.userId,
        lineDisplayName: profile.displayName,
        linePictureUrl: profile.pictureUrl
      };

      await new Promise<void>((resolve, reject) => {
        req.session.save(err => (err ? reject(err) : resolve()));
      });

      return res.redirect('/clock-in');
    } catch (err) {
      log.error('LINE callback 處理失敗:', err);
      return res.redirect('/clock-in?error=callback_failed');
    }
  });

  // GET /api/line/temp-data — 一次性取出 session 中的 LINE 暫存資料
  app.get('/api/line/temp-data', (req, res) => {
    const lineTemp = req.session.lineTemp;
    if (!lineTemp) {
      return res.status(404).json({ error: '無 LINE 暫存資料' });
    }
    req.session.lineTemp = undefined;
    return res.json(lineTemp);
  });

  // POST /api/line/bind — 員工提交綁定申請（需提供完整身分證字號）
  app.post('/api/line/bind', async (req, res) => {
    const { lineUserId, lineDisplayName, linePictureUrl, idNumber } = req.body ?? {};

    if (!lineUserId || typeof lineUserId !== 'string') {
      return res.status(400).json({ error: '缺少 lineUserId' });
    }
    if (!idNumber || typeof idNumber !== 'string' || idNumber.trim().length === 0) {
      return res.status(400).json({ error: '請輸入身分證字號或居留證號碼' });
    }

    try {
      // 檢查是否已綁定
      const alreadyBound = await storage.getEmployeeByLineUserId(lineUserId);
      if (alreadyBound) {
        return res.status(409).json({ error: '此 LINE 帳號已綁定員工', alreadyBound: true });
      }

      // 查找員工（AES 加密感知的查找）
      const employee = await storage.getEmployeeByIdNumber(idNumber.trim());
      if (!employee) {
        return res.status(404).json({ error: '找不到對應的員工，請確認身分證字號是否正確' });
      }
      if (!employee.active) {
        return res.status(403).json({ error: '此員工帳號已停用' });
      }

      // 檢查是否已有待審核申請
      const existing = await storage.getPendingBindingByLineUserId(lineUserId);
      if (existing && existing.status === 'pending') {
        return res.json({ success: true, status: 'pending', message: '申請已送出，等待管理員審核' });
      }

      // 建立待審核綁定
      await storage.createPendingBinding({
        employeeId: employee.id,
        lineUserId,
        lineDisplayName: lineDisplayName ?? null,
        linePictureUrl: linePictureUrl ?? null,
        status: 'pending',
        requestedAt: new Date()
      });

      log.info(`LINE 綁定申請：員工 ${employee.name} (id=${employee.id})`);
      return res.json({ success: true, status: 'pending', employeeName: employee.name });
    } catch (err) {
      log.error('LINE 綁定申請失敗:', err);
      return handleRouteError(err, res);
    }
  });

  // GET /api/line/binding-status/:lineUserId — 查詢綁定狀態
  app.get('/api/line/binding-status/:lineUserId', async (req, res) => {
    const { lineUserId } = req.params;
    if (!lineUserId) {
      return res.status(400).json({ error: '缺少 lineUserId' });
    }

    try {
      const employee = await storage.getEmployeeByLineUserId(lineUserId);
      if (employee) {
        return res.json({
          status: 'bound',
          employeeId: employee.id,
          employeeName: employee.name,
          department: employee.department
        });
      }

      const pending = await storage.getPendingBindingByLineUserId(lineUserId);
      if (pending) {
        return res.json({ status: pending.status });
      }

      return res.json({ status: 'unbound' });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  // POST /api/line/clock-in — LINE 打卡
  app.post('/api/line/clock-in', async (req, res) => {
    const { lineUserId } = req.body ?? {};
    if (!lineUserId || typeof lineUserId !== 'string') {
      return res.status(400).json({ error: '缺少 lineUserId' });
    }

    try {
      const employee = await storage.getEmployeeByLineUserId(lineUserId);
      if (!employee) {
        return res.status(404).json({ error: '此 LINE 帳號尚未綁定員工，請先申請綁定' });
      }

      const { dateKey, time, timestamp } = getTaiwanDateTimeParts();

      // 查詢今日考勤記錄
      const todayRecords = await storage.getTemporaryAttendanceByEmployeeAndDate(employee.id, dateKey);
      const normalizedDateKey = normalizeDateToSlash(dateKey);
      const todayFiltered = todayRecords.filter(
        r => normalizeDateToSlash(r.date) === normalizedDateKey
      );

      // 找最後一筆未完成的（有上班沒下班）
      const incomplete = todayFiltered
        .filter(r => r.clockIn && !r.clockOut)
        .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];

      let attendance;
      let isClockIn: boolean;

      if (incomplete) {
        attendance = await storage.updateTemporaryAttendance(incomplete.id, { clockOut: time });
        isClockIn = false;
      } else {
        attendance = await storage.createTemporaryAttendance({
          employeeId: employee.id,
          date: dateKey,
          clockIn: time,
          clockOut: '',
          isHoliday: false,
          isBarcodeScanned: true
        });
        isClockIn = true;
      }

      // 非阻塞送出 LINE 推播通知
      sendClockInNotification(lineUserId, employee.name, time, isClockIn).catch(err =>
        log.warn('LINE 打卡通知發送失敗:', err)
      );

      const action = isClockIn ? 'clock-in' : 'clock-out';
      log.info(`LINE 打卡：${employee.name} ${action} ${time}`);

      return res.json({
        success: true,
        action,
        employeeName: employee.name,
        department: employee.department,
        clockTime: time,
        timestamp,
        attendance
      });
    } catch (err) {
      log.error('LINE 打卡失敗:', err);
      return handleRouteError(err, res);
    }
  });

  // ── Admin endpoints ──────────────────────────────────────────────────────

  // GET /api/line/pending-bindings — 取得全部待審核綁定
  app.get('/api/line/pending-bindings', requireAdmin(), async (_req, res) => {
    try {
      const bindings = await storage.getPendingBindings();
      // 附帶員工姓名
      const enriched = await Promise.all(
        bindings.map(async b => {
          const emp = await storage.getEmployeeById(b.employeeId);
          return { ...b, employeeName: emp?.name ?? '(已刪除)' };
        })
      );
      return res.json(enriched);
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  // POST /api/line/pending-bindings/:id/approve — 核准綁定
  app.post('/api/line/pending-bindings/:id/approve', requireAdmin(), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: '無效的 ID' });

    try {
      const binding = await storage.approvePendingBinding(id, 'admin');
      if (!binding) return res.status(404).json({ error: '找不到此綁定申請' });

      // 通知員工
      sendClockInNotification(
        binding.lineUserId,
        binding.lineDisplayName ?? '',
        '',
        true
      ).catch(() => {});

      // 改發送核准通知
      (async () => {
        const { pushMessage: push } = await import('../services/line.service');
        await push(
          binding.lineUserId,
          `✅ 綁定已核准！\n\n您的 LINE 帳號已成功綁定員工帳號。\n現在可以使用 LINE 打卡囉！`
        ).catch(() => {});
      })();

      log.info(`LINE 綁定核准：binding id=${id}`);
      return res.json({ success: true, binding });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  // POST /api/line/pending-bindings/:id/reject — 拒絕綁定
  app.post('/api/line/pending-bindings/:id/reject', requireAdmin(), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: '無效的 ID' });

    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '申請未通過審核';

    try {
      const binding = await storage.rejectPendingBinding(id, 'admin', reason);
      if (!binding) return res.status(404).json({ error: '找不到此綁定申請' });

      // 通知員工被拒絕
      (async () => {
        const { pushMessage: push } = await import('../services/line.service');
        await push(
          binding.lineUserId,
          `❌ 綁定申請未通過\n\n原因：${reason}\n\n如有疑問請聯絡管理員。`
        ).catch(() => {});
      })();

      log.info(`LINE 綁定拒絕：binding id=${id}, reason=${reason}`);
      return res.json({ success: true, binding });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  // DELETE /api/line/pending-bindings/:id — 刪除綁定申請
  app.delete('/api/line/pending-bindings/:id', requireAdmin(), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: '無效的 ID' });

    try {
      const deleted = await storage.deletePendingBinding(id);
      if (!deleted) return res.status(404).json({ error: '找不到此綁定申請' });
      return res.json({ success: true });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  // POST /api/line/webhook — LINE Webhook（需 raw body，由 index.ts 前置 express.raw）
  app.post('/api/line/webhook', (req, res) => {
    const signature = req.headers['x-line-signature'];
    if (!signature || typeof signature !== 'string') {
      return res.status(400).json({ error: '缺少 LINE webhook 簽章' });
    }

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body)) {
      return res.status(400).json({ error: 'Webhook body 格式錯誤' });
    }

    if (!verifyWebhookSignature(body, signature)) {
      log.warn('LINE webhook 簽章驗證失敗');
      return res.status(401).json({ error: '簽章驗證失敗' });
    }

    // 目前僅記錄事件，未來可擴展 bot 互動功能
    try {
      const events = JSON.parse(body.toString()).events ?? [];
      log.info(`LINE webhook 收到 ${events.length} 個事件`);
    } catch {
      // 解析失敗不影響回應
    }

    return res.sendStatus(200);
  });
}
