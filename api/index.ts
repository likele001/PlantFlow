/**
 * Vercel serverless entry (legacy). Production uses Docker only — see docker-compose.yml.
 * Worker, Cron, and Redis are not available in this entry.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from './app.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}