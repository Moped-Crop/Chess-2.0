/**
 * Валидация тела запроса через zod: любой вход с клиента не заслуживает
 * доверия. При ошибке — 400 с кратким перечнем проблем (без внутренностей).
 */

import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';

export function validate<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'validation',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    req.body = parsed.data;
    next();
  };
}
