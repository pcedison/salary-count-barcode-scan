import type { NextFunction, Request, Response } from 'express';

import {
  PermissionLevel,
  logOperation,
  OperationType,
  verifyAdminPermission
} from '../admin-auth';

export function extractAdminPin(req: Pick<Request, 'headers'>): string | null {
  const headerPin = req.headers['x-admin-pin'];
  if (typeof headerPin === 'string' && headerPin.trim()) {
    return headerPin.trim();
  }

  if (Array.isArray(headerPin) && headerPin[0]?.trim()) {
    return headerPin[0].trim();
  }

  const authorization = req.headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim();
    return token || null;
  }

  return null;
}

export function requireAdmin(requiredLevel: PermissionLevel = PermissionLevel.ADMIN) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const adminPin = extractAdminPin(req);

    if (!adminPin) {
      logOperation(
        OperationType.AUTHORIZATION,
        `缺少管理員授權: ${req.method} ${req.originalUrl}`,
        {
          ip: req.ip,
          success: false,
          errorMessage: 'missing_admin_pin'
        }
      );

      return res.status(401).json({
        success: false,
        message: '缺少管理員授權，請重新登入管理員模式'
      });
    }

    const authorized = await verifyAdminPermission(adminPin, requiredLevel);
    if (!authorized) {
      logOperation(
        OperationType.AUTHORIZATION,
        `管理員授權失敗: ${req.method} ${req.originalUrl}`,
        {
          ip: req.ip,
          success: false,
          errorMessage: 'invalid_admin_pin'
        }
      );

      return res.status(403).json({
        success: false,
        message: '管理員授權失敗'
      });
    }

    next();
  };
}
