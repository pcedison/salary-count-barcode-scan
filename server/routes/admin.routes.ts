import type { Express } from 'express';

import { hashPassword, verifyAdminPermission } from '../admin-auth';
import { loginLimiter, strictLimiter } from '../middleware/rateLimiter';
import { storage } from '../storage';
import { validatePin } from '@shared/utils/passwordValidator';

import { handleRouteError } from './route-helpers';

export function registerAdminRoutes(app: Express): void {
  app.post('/api/verify-admin', loginLimiter, async (req, res) => {
    try {
      const { pin } = req.body;

      if (!pin) {
        return res.status(400).json({ success: false, message: 'PIN is required' });
      }

      const isValid = await verifyAdminPermission(pin);
      return res.json({ success: isValid });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.post('/api/update-admin-pin', strictLimiter, async (req, res) => {
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

      return res.json({ success: true, strength: validation.strength });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });
}
