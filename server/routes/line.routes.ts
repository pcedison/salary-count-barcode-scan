import crypto from 'crypto';
import type { Express, Request, Response } from 'express';

import { normalizeDateToSlash } from '@shared/utils/specialLeaveSync';

import { strictLimiter, lineBindLimiter, lineClockInLimiter, lineSessionLimiter, liffClockInLimiter } from '../middleware/rateLimiter';
import { requireAdmin } from '../middleware/requireAdmin';
import { storage } from '../storage';
import { createLogger } from '../utils/logger';

import {
  exchangeCodeForToken,
  getLineLoginUrl,
  getLineProfile,
  isLineConfigured,
  pushMessage,
  sendClockInNotification,
  verifyLiffAccessToken,
  verifyWebhookSignature
} from '../services/line.service';
import { handleRouteError, parseNumericId } from './route-helpers';
import { getTaiwanDateTimeParts } from './scan-helpers';

const log = createLogger('line-routes');

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

type AuthorizedLineSession = {
  lineUserId: string;
  lineDisplayName: string;
  linePictureUrl?: string;
};

function setNoStore(res: Response) {
  res.setHeader('Cache-Control', 'no-store');
}

function maskLineUserId(lineUserId: string): string {
  const normalized = lineUserId.trim();
  if (normalized.length <= 8) {
    return '***';
  }

  return `${normalized.slice(0, 4)}***${normalized.slice(-4)}`;
}

function getAuthorizedLineSession(req: Request): AuthorizedLineSession | null {
  const lineAuth = req.session?.lineAuth;
  if (lineAuth) {
    return {
      lineUserId: lineAuth.lineUserId,
      lineDisplayName: lineAuth.lineDisplayName,
      linePictureUrl: lineAuth.linePictureUrl
    };
  }

  const lineTemp = req.session?.lineTemp;
  if (!lineTemp) {
    return null;
  }

  return {
    lineUserId: lineTemp.lineUserId,
    lineDisplayName: lineTemp.lineDisplayName,
    linePictureUrl: lineTemp.linePictureUrl
  };
}

function requireLineSession(req: Request, res: Response): AuthorizedLineSession | null {
  const lineSession = getAuthorizedLineSession(req);
  if (lineSession) {
    return lineSession;
  }

  res.setHeader('X-Line-Session-Required', 'true');
  res.status(401).json({
    success: false,
    code: 'LINE_SESSION_REQUIRED',
    error: 'LINE login session required.'
  });
  return null;
}

function ensureConfigured(res: Response): boolean {
  if (isLineConfigured()) {
    return true;
  }

  res.status(503).json({
    success: false,
    code: 'LINE_NOT_CONFIGURED',
    error: 'LINE integration is not configured.'
  });
  return false;
}

function assertAuthorizedLineUser(
  req: Request,
  res: Response,
  lineSession: AuthorizedLineSession,
  candidate: unknown
): boolean {
  if (candidate === undefined || candidate === null || candidate === '') {
    return true;
  }

  if (typeof candidate === 'string' && candidate === lineSession.lineUserId) {
    return true;
  }

  res.status(403).json({
    success: false,
    code: 'LINE_SESSION_MISMATCH',
    error: 'The LINE session does not match the requested user.'
  });
  return false;
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function registerLineRoutes(app: Express): void {
  app.get('/api/line/config', (_req, res) => {
    setNoStore(res);
    res.json({ configured: isLineConfigured() });
  });

  app.get('/api/line/login', lineSessionLimiter, async (_req, res) => {
    if (!ensureConfigured(res)) {
      return;
    }

    try {
      const state = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);

      await storage.createOAuthState({ state, expiresAt });
      return res.redirect(getLineLoginUrl(state));
    } catch (err) {
      log.error('Failed to start LINE login flow', err);
      return handleRouteError(err, res);
    }
  });

  app.get('/api/line/callback', async (req, res) => {
    if (!isLineConfigured()) {
      return res.redirect('/clock-in?error=line_not_configured');
    }

    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      return res.redirect('/clock-in?error=line_auth_failed');
    }

    if (!code || !state) {
      return res.redirect('/clock-in?error=missing_params');
    }

    try {
      const storedState = await storage.getOAuthState(state);
      if (!storedState) {
        return res.redirect('/clock-in?error=invalid_state');
      }

      if (new Date() > storedState.expiresAt) {
        await storage.deleteOAuthState(state);
        return res.redirect('/clock-in?error=state_expired');
      }

      await storage.deleteOAuthState(state);

      const tokenData = await exchangeCodeForToken(code);
      const profile = await getLineProfile(tokenData.access_token);

      req.session.lineAuth = {
        lineUserId: profile.userId,
        lineDisplayName: profile.displayName,
        linePictureUrl: profile.pictureUrl,
        authenticatedAt: Date.now()
      };
      req.session.lineTemp = {
        lineUserId: profile.userId,
        lineDisplayName: profile.displayName,
        linePictureUrl: profile.pictureUrl
      };
      await saveSession(req);

      return res.redirect('/clock-in');
    } catch (err) {
      log.error('LINE callback failed', err);
      return res.redirect('/clock-in?error=callback_failed');
    }
  });

  app.get('/api/line/temp-data', lineSessionLimiter, (req, res) => {
    setNoStore(res);

    const lineSession = requireLineSession(req, res);
    if (!lineSession) {
      return;
    }

    res.json(lineSession);
  });

  app.post('/api/line/liff-auth', liffClockInLimiter, async (req, res) => {
    if (!ensureConfigured(res)) return;

    const { accessToken } = req.body as { accessToken?: string };
    if (!accessToken || typeof accessToken !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'MISSING_TOKEN',
        error: 'LIFF access token required.'
      });
    }

    try {
      const profile = await verifyLiffAccessToken(accessToken);
      if (!profile) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_TOKEN',
          error: 'Invalid or expired LIFF access token.'
        });
      }

      req.session.lineAuth = {
        lineUserId: profile.userId,
        lineDisplayName: profile.displayName,
        linePictureUrl: profile.pictureUrl,
        authenticatedAt: Date.now()
      };
      req.session.lineTemp = {
        lineUserId: profile.userId,
        lineDisplayName: profile.displayName,
        linePictureUrl: profile.pictureUrl
      };
      await saveSession(req);

      // 同時回傳綁定狀態，讓前端省掉第 2 個 binding-status 請求
      const boundEmployee = await storage.getEmployeeByLineUserId(profile.userId);
      let bindingStatus: 'bound' | 'pending' | 'unbound' = 'unbound';
      let employeeName: string | undefined;

      if (boundEmployee) {
        bindingStatus = 'bound';
        employeeName = boundEmployee.name;
      } else {
        const pending = await storage.getPendingBindingByLineUserId(profile.userId);
        if (pending && pending.status === 'pending') {
          bindingStatus = 'pending';
        }
      }

      log.info(`LIFF auth successful for ${maskLineUserId(profile.userId)}, binding: ${bindingStatus}`);
      return res.json({
        success: true,
        lineUserId: profile.userId,
        lineDisplayName: profile.displayName,
        linePictureUrl: profile.pictureUrl,
        bindingStatus,
        employeeName
      });
    } catch (err) {
      log.error('LIFF auth failed', err);
      return handleRouteError(err, res);
    }
  });

  app.post('/api/line/bind', lineBindLimiter, async (req, res) => {
    if (!ensureConfigured(res)) {
      return;
    }

    const lineSession = requireLineSession(req, res);
    if (!lineSession) {
      return;
    }

    if (!assertAuthorizedLineUser(req, res, lineSession, req.body?.lineUserId)) {
      return;
    }

    const idNumber = typeof req.body?.idNumber === 'string' ? req.body.idNumber.trim() : '';
    if (!idNumber) {
      return res.status(400).json({
        success: false,
        code: 'ID_NUMBER_REQUIRED',
        error: 'Employee identifier is required.'
      });
    }

    try {
      const alreadyBound = await storage.getEmployeeByLineUserId(lineSession.lineUserId);
      if (alreadyBound) {
        return res.status(409).json({
          success: false,
          code: 'LINE_ALREADY_BOUND',
          error: 'This LINE account is already bound to an employee.',
          alreadyBound: true
        });
      }

      const employee = await storage.getEmployeeByIdNumber(idNumber);
      if (!employee) {
        return res.status(404).json({
          success: false,
          code: 'EMPLOYEE_NOT_FOUND',
          error: 'Employee not found.'
        });
      }

      if (!employee.active) {
        return res.status(403).json({
          success: false,
          code: 'EMPLOYEE_INACTIVE',
          error: 'Inactive employees cannot bind LINE login.'
        });
      }

      const existing = await storage.getPendingBindingByLineUserId(lineSession.lineUserId);
      if (existing && existing.status === 'pending') {
        return res.json({
          success: true,
          status: 'pending',
          message: 'Binding request is already pending review.'
        });
      }

      await storage.createPendingBinding({
        employeeId: employee.id,
        lineUserId: lineSession.lineUserId,
        lineDisplayName: lineSession.lineDisplayName,
        linePictureUrl: lineSession.linePictureUrl ?? null,
        status: 'pending',
        requestedAt: new Date()
      });

      log.info(
        `Created LINE binding request for employee ${employee.id} using ${maskLineUserId(lineSession.lineUserId)}`
      );

      return res.json({
        success: true,
        status: 'pending',
        employeeName: employee.name
      });
    } catch (err) {
      log.error('Failed to create LINE binding request', err);
      return handleRouteError(err, res);
    }
  });

  app.get('/api/line/binding-status/:lineUserId', lineSessionLimiter, async (req, res) => {
    setNoStore(res);

    const lineSession = requireLineSession(req, res);
    if (!lineSession) {
      return;
    }

    if (!assertAuthorizedLineUser(req, res, lineSession, req.params.lineUserId)) {
      return;
    }

    try {
      const employee = await storage.getEmployeeByLineUserId(lineSession.lineUserId);
      if (employee) {
        return res.json({
          status: 'bound',
          employeeId: employee.id,
          employeeName: employee.name,
          department: employee.department
        });
      }

      const pending = await storage.getPendingBindingByLineUserId(lineSession.lineUserId);
      if (pending) {
        return res.json({ status: pending.status });
      }

      return res.json({ status: 'unbound' });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.post('/api/line/clock-in', lineClockInLimiter, async (req, res) => {
    if (!ensureConfigured(res)) {
      return;
    }

    const lineSession = requireLineSession(req, res);
    if (!lineSession) {
      return;
    }

    if (!assertAuthorizedLineUser(req, res, lineSession, req.body?.lineUserId)) {
      return;
    }

    try {
      const employee = await storage.getEmployeeByLineUserId(lineSession.lineUserId);
      if (!employee) {
        return res.status(404).json({
          success: false,
          code: 'LINE_EMPLOYEE_NOT_BOUND',
          error: 'This LINE account is not bound to an employee.'
        });
      }

      if (!employee.active) {
        return res.status(403).json({
          success: false,
          code: 'EMPLOYEE_INACTIVE',
          error: 'Inactive employees cannot clock in with LINE.'
        });
      }

      const { dateKey, time, timestamp } = getTaiwanDateTimeParts();
      const todayRecords = await storage.getTemporaryAttendanceByEmployeeAndDate(employee.id, dateKey);
      const normalizedDateKey = normalizeDateToSlash(dateKey);
      const todayFiltered = todayRecords.filter(
        (record) => normalizeDateToSlash(record.date) === normalizedDateKey
      );
      const incomplete = todayFiltered
        .filter((record) => record.clockIn && !record.clockOut)
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

      sendClockInNotification(lineSession.lineUserId, employee.name, time, isClockIn).catch((err) =>
        log.warn('Failed to send LINE clock-in notification', err)
      );

      return res.json({
        success: true,
        action: isClockIn ? 'clock-in' : 'clock-out',
        employeeName: employee.name,
        department: employee.department,
        clockTime: time,
        timestamp,
        attendance
      });
    } catch (err) {
      log.error('LINE clock-in request failed', err);
      return handleRouteError(err, res);
    }
  });

  app.get('/api/line/pending-bindings', requireAdmin(), async (_req, res) => {
    try {
      setNoStore(res);
      const bindings = await storage.getPendingBindings();
      const enriched = await Promise.all(
        bindings.map(async (binding) => {
          const employee = await storage.getEmployeeById(binding.employeeId);
          return {
            ...binding,
            employeeName: employee?.name ?? '(deleted employee)'
          };
        })
      );

      return res.json(enriched);
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.post('/api/line/pending-bindings/:id/approve', strictLimiter, requireAdmin(), async (req, res) => {
    const id = parseNumericId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'Invalid binding id' });
    }

    try {
      const binding = await storage.approvePendingBinding(id, 'admin');
      if (!binding) {
        return res.status(404).json({ error: 'Pending binding not found' });
      }

      await pushMessage(
        binding.lineUserId,
        'Your LINE account has been approved. You can now use LINE to clock in and clock out.'
      );

      log.info(`Approved LINE binding ${id} for ${maskLineUserId(binding.lineUserId)}`);
      return res.json({ success: true, binding });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.post('/api/line/pending-bindings/:id/reject', strictLimiter, requireAdmin(), async (req, res) => {
    const id = parseNumericId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'Invalid binding id' });
    }

    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim()
        : 'Binding request was rejected by an administrator.';

    try {
      const binding = await storage.rejectPendingBinding(id, 'admin', reason);
      if (!binding) {
        return res.status(404).json({ error: 'Pending binding not found' });
      }

      await pushMessage(
        binding.lineUserId,
        `Your LINE binding request was rejected.\n\nReason: ${reason}`
      );

      log.info(`Rejected LINE binding ${id} for ${maskLineUserId(binding.lineUserId)}`);
      return res.json({ success: true, binding });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.delete('/api/line/pending-bindings/:id', strictLimiter, requireAdmin(), async (req, res) => {
    const id = parseNumericId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'Invalid binding id' });
    }

    try {
      const deleted = await storage.deletePendingBinding(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Pending binding not found' });
      }

      return res.json({ success: true });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.post('/api/line/webhook', (req, res) => {
    if (!isLineConfigured()) {
      return res.status(503).json({
        success: false,
        code: 'LINE_NOT_CONFIGURED',
        error: 'LINE integration is not configured.'
      });
    }

    const signature = req.headers['x-line-signature'];
    if (!signature || typeof signature !== 'string') {
      return res.status(400).json({ error: 'Missing LINE webhook signature' });
    }

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body)) {
      return res.status(400).json({ error: 'Webhook body must be a raw Buffer' });
    }

    if (!verifyWebhookSignature(body, signature)) {
      log.warn('Rejected LINE webhook with invalid signature');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    try {
      const events = JSON.parse(body.toString()).events ?? [];
      log.info(`Received ${events.length} LINE webhook event(s)`);
    } catch {
      // Ignore parse errors after signature verification; acknowledge the webhook anyway.
    }

    return res.sendStatus(200);
  });
}
