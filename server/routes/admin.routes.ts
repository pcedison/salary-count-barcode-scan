import type { Express } from 'express';

import { PermissionLevel, hashPassword, logOperation, OperationType, verifyAdminPermission } from '../admin-auth';
import { loginLimiter, strictLimiter } from '../middleware/rateLimiter';
import { requireAdmin } from '../middleware/requireAdmin';
import {
  clearAdminSession,
  createAdminSession,
  getAdminSessionPolicy,
  hasAdminSession,
  touchAdminSession
} from '../session';
import { storage } from '../storage';
import { hashAdminPin, needsRehash } from '../utils/adminPinAuth';
import { createLogger } from '../utils/logger';
import { validatePin } from '@shared/utils/passwordValidator';

import { handleRouteError } from './route-helpers';

const log = createLogger('admin-routes');

function buildAdminSessionPolicyPayload() {
  const policy = getAdminSessionPolicy();

  return {
    sessionTimeoutMinutes: policy.timeoutMinutes,
    sessionTimeoutMs: policy.timeoutMs,
    sessionRefreshIntervalMs: policy.refreshIntervalMs
  };
}

export function registerAdminRoutes(app: Express): void {
  app.post('/api/verify-admin', loginLimiter, async (req, res) => {
    try {
      const { pin } = req.body;

      if (!pin) {
        return res.status(400).json({ success: false, message: 'PIN is required' });
      }

      const isValid = await verifyAdminPermission(pin);
      if (!isValid) {
        logOperation(OperationType.LOGIN, '管理員登入失敗', {
          ip: req.ip,
          success: false,
          errorMessage: 'invalid_admin_pin'
        });
        return res.json({ success: false });
      }

      // Transparent PBKDF2 iteration upgrade: re-hash with current iterations on login
      try {
        const settings = await storage.getSettings();
        if (settings?.adminPin && needsRehash(settings.adminPin)) {
          const upgraded = hashAdminPin(pin);
          await storage.createOrUpdateSettings({ ...settings, adminPin: upgraded });
          log.info('Admin PIN auto-upgraded to current PBKDF2 iteration count');
        }
      } catch (rehashErr) {
        log.error('Failed to auto-upgrade admin PIN hash:', rehashErr);
      }

      await createAdminSession(req, PermissionLevel.SUPER);
      logOperation(OperationType.LOGIN, '管理員登入成功', {
        ip: req.ip,
        success: true
      });

      return res.json({
        success: true,
        authMode: 'session',
        permissionLevel: PermissionLevel.SUPER,
        ...buildAdminSessionPolicyPayload()
      });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.get('/api/admin/session', async (req, res) => {
    try {
      const isAdmin = hasAdminSession(req, PermissionLevel.ADMIN);
      if (isAdmin) {
        touchAdminSession(req);
      }

      return res.json({
        success: true,
        isAdmin,
        authMode: 'session',
        permissionLevel: isAdmin ? req.session.adminAuth?.permissionLevel : null,
        authenticatedAt: isAdmin ? req.session.adminAuth?.authenticatedAt : null,
        ...buildAdminSessionPolicyPayload()
      });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.post('/api/admin/logout', async (req, res) => {
    try {
      const hadSession = hasAdminSession(req, PermissionLevel.ADMIN);
      await clearAdminSession(req, res);

      if (hadSession) {
        logOperation(OperationType.LOGOUT, '管理員登出成功', {
          ip: req.ip,
          success: true
        });
      }

      return res.json({
        success: true
      });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.post('/api/update-admin-pin', strictLimiter, requireAdmin(PermissionLevel.ADMIN), async (req, res) => {
    try {
      const { oldPin, newPin } = req.body;

      if (!oldPin || !newPin) {
        return res.status(400).json({
          success: false,
          message: 'Old PIN and new PIN are required'
        });
      }

      const validation = validatePin(newPin);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: 'New PIN does not meet security requirements',
          errors: validation.errors
        });
      }

      const settings = await storage.getSettings();
      if (!settings) {
        return res.status(404).json({ success: false, message: 'Settings not found' });
      }

      if (!(await verifyAdminPermission(oldPin))) {
        return res.status(401).json({
          success: false,
          message: 'Current PIN is incorrect'
        });
      }

      await storage.createOrUpdateSettings({
        ...settings,
        adminPin: hashPassword(newPin)
      });

      logOperation(OperationType.UPDATE, '管理員 PIN 更新成功', {
        ip: req.ip,
        success: true
      });

      return res.json({ success: true, strength: validation.strength });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });
}
