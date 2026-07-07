import { Router } from 'express';
import { q } from '../db/pool.js';
export const health = Router();
health.get('/health', async (_req, res) => {
  try { await q('SELECT 1'); res.json({ ok: true }); }
  catch { res.status(500).json({ ok: false }); }
});
