import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyAdminPermissionMock, logOperationMock } = vi.hoisted(() => ({
  verifyAdminPermissionMock: vi.fn(),
  logOperationMock: vi.fn()
}));

vi.mock('../admin-auth', () => ({
  PermissionLevel: {
    ADMIN: 3
  },
  OperationType: {
    AUTHORIZATION: 'authorization'
  },
  verifyAdminPermission: verifyAdminPermissionMock,
  logOperation: logOperationMock
}));

import { extractAdminPin, requireAdmin } from './requireAdmin';

function createMockResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  } as unknown as Response;
}

describe('requireAdmin middleware', () => {
  beforeEach(() => {
    verifyAdminPermissionMock.mockReset();
    logOperationMock.mockReset();
  });

  it('extracts admin pin from x-admin-pin header', () => {
    const pin = extractAdminPin({
      headers: {
        'x-admin-pin': '123456'
      }
    } as Pick<Request, 'headers'>);

    expect(pin).toBe('123456');
  });

  it('allows authorized requests to continue', async () => {
    verifyAdminPermissionMock.mockResolvedValue(true);

    const req = {
      headers: {
        'x-admin-pin': '123456'
      },
      method: 'POST',
      originalUrl: '/api/settings',
      ip: '127.0.0.1'
    } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await requireAdmin()(req, res, next);

    expect(verifyAdminPermissionMock).toHaveBeenCalledWith('123456', 3);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects requests without admin authorization', async () => {
    const req = {
      headers: {},
      method: 'POST',
      originalUrl: '/api/settings',
      ip: '127.0.0.1'
    } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await requireAdmin()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false
      })
    );
    expect(next).not.toHaveBeenCalled();
    expect(logOperationMock).toHaveBeenCalled();
  });

  it('rejects requests with invalid admin pin', async () => {
    verifyAdminPermissionMock.mockResolvedValue(false);

    const req = {
      headers: {
        'x-admin-pin': 'bad-pin'
      },
      method: 'DELETE',
      originalUrl: '/api/employees/1',
      ip: '127.0.0.1'
    } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await requireAdmin()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false
      })
    );
    expect(next).not.toHaveBeenCalled();
    expect(logOperationMock).toHaveBeenCalled();
  });
});
