import type { Express, Request, Response } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';

import {
  createAdminSessionPolicy,
  parseAdminSessionTimeoutMinutes
} from '@shared/utils/adminSessionPolicy';
import { PermissionLevel } from './admin-auth';
import { createLogger } from './utils/logger';

const log = createLogger('session');

const DEFAULT_SESSION_SECRET = 'development-session-secret-do-not-use';

export const ADMIN_SESSION_COOKIE_NAME = 'employee_salary_admin.sid';

export interface AdminSessionState {
  isAdmin: true;
  permissionLevel: PermissionLevel;
  authenticatedAt: number;
  lastVerifiedAt: number;
}

declare module 'express-session' {
  interface SessionData {
    adminAuth?: AdminSessionState;
    // LINE OAuth 暫存資料（callback 後存入，ClockInPage 一次性取出即清除）
    lineTemp?: {
      lineUserId: string;
      lineDisplayName: string;
      linePictureUrl?: string;
    };
  }
}

function resolveSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
    return process.env.SESSION_SECRET;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set to enable secure admin sessions in production');
  }

  if (process.env.NODE_ENV !== 'test') {
    log.warn('SESSION_SECRET 未設定，使用開發用暫時 session secret');
  }

  return DEFAULT_SESSION_SECRET;
}

export function getAdminSessionPolicy() {
  return createAdminSessionPolicy(
    parseAdminSessionTimeoutMinutes(process.env.SESSION_TIMEOUT)
  );
}

function getCookieSameSite(): 'lax' | 'strict' | 'none' {
  const sameSite = process.env.SESSION_SAME_SITE?.toLowerCase();

  if (sameSite === 'strict' || sameSite === 'none') {
    return sameSite;
  }

  return 'lax';
}

function isSecureCookieEnabled(): boolean {
  if (process.env.SESSION_SECURE === 'true') {
    return true;
  }

  if (process.env.SESSION_SECURE === 'false') {
    return false;
  }

  return process.env.NODE_ENV === 'production';
}

function isHttpOnlyEnabled(): boolean {
  return process.env.SESSION_HTTP_ONLY !== 'false';
}

function createSessionStore() {
  if (process.env.NODE_ENV === 'test') {
    return undefined;
  }

  const PgStore = connectPgSimple(session);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  return new PgStore({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true
  });
}

function getBaseCookieOptions() {
  return {
    httpOnly: isHttpOnlyEnabled(),
    sameSite: getCookieSameSite() as 'lax' | 'strict' | 'none',
    secure: isSecureCookieEnabled(),
    path: '/'
  };
}

export function setupAdminSession(app: Express): void {
  const sessionPolicy = getAdminSessionPolicy();

  app.use(
    session({
      name: ADMIN_SESSION_COOKIE_NAME,
      secret: resolveSessionSecret(),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      proxy: process.env.TRUST_PROXY === 'true',
      store: createSessionStore(),
      cookie: {
        ...getBaseCookieOptions(),
        maxAge: sessionPolicy.timeoutMs
      }
    })
  );
}

export function hasAdminSession(
  req: { session?: Request['session'] },
  requiredLevel: PermissionLevel = PermissionLevel.ADMIN
): boolean {
  const adminAuth = req.session?.adminAuth;
  return Boolean(
    adminAuth?.isAdmin &&
      adminAuth.permissionLevel >= requiredLevel
  );
}

export function touchAdminSession(req: { session?: Request['session'] }): void {
  if (!req.session?.adminAuth) {
    return;
  }

  req.session.adminAuth.lastVerifiedAt = Date.now();
}

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
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

function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function createAdminSession(
  req: Request,
  permissionLevel: PermissionLevel = PermissionLevel.SUPER
): Promise<void> {
  if (!req.session) {
    throw new Error('Admin session middleware is not initialized');
  }

  await regenerateSession(req);
  req.session.adminAuth = {
    isAdmin: true,
    permissionLevel,
    authenticatedAt: Date.now(),
    lastVerifiedAt: Date.now()
  };
  await saveSession(req);
}

export async function clearAdminSession(req: Request, res?: Response): Promise<void> {
  if (req.session) {
    await destroySession(req);
  }

  if (res) {
    res.clearCookie(ADMIN_SESSION_COOKIE_NAME, getBaseCookieOptions());
  }
}
