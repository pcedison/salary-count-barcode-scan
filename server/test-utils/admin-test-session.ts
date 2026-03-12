import type { Express, Request } from 'express';

import { PermissionLevel } from '../admin-auth';
import { setupAdminSession } from '../session';

export const TEST_ADMIN_HEADER = 'x-test-admin';

export function setupTestAdminSession(app: Express): void {
  setupAdminSession(app);

  app.use((req, _res, next) => {
    if (req.headers[TEST_ADMIN_HEADER] === 'true') {
      req.session.adminAuth = {
        isAdmin: true,
        permissionLevel: PermissionLevel.SUPER,
        authenticatedAt: Date.now(),
        lastVerifiedAt: Date.now()
      };
    }

    next();
  });
}

export function hasTestAdminSession(req: Pick<Request, 'session'>): boolean {
  return Boolean(req.session?.adminAuth?.isAdmin);
}
