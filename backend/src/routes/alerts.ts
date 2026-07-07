import { Router } from 'express';
import { q } from '../db/pool.js';
export const alerts = Router();

alerts.get('/houses/:id/alerts', async (req, res) => {
  const resolved = req.query.resolved === 'true';
  const r = await q(
    `SELECT * FROM alerts WHERE house_id=$1 AND (resolved_at IS ${resolved ? 'NOT NULL' : 'NULL'})
     ORDER BY ts DESC LIMIT 100`, [req.params.id]);
  res.json(r.rows);
});
alerts.post('/alerts/:id/resolve', async (req, res) => {
  await q('UPDATE alerts SET resolved_at=now() WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});
