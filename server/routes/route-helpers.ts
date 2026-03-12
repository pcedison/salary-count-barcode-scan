import type { Response } from 'express';
import { ZodError } from 'zod';
import { fromZodError } from 'zod-validation-error';

export function handleRouteError(err: unknown, res: Response) {
  console.error('API Error:', err);

  if (err instanceof ZodError) {
    const validationError = fromZodError(err);
    return res.status(400).json({
      message: 'Validation error',
      errors: validationError.details
    });
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  return res.status(500).json({
    message
  });
}
