import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const message = err.stderr || err.message || 'Internal server error';
  const status = err.status || 500;
  res.status(status).json({ error: message });
}
