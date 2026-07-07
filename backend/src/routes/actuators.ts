import { Router } from 'express';
import { z } from 'zod';
import { q } from '../db/pool.js';
import { sendCommand } from '../mqtt/client.js';
export const actuators = Router();

const cmd = z.object({ action: z.enum(['on', 'off', 'auto']), ttl_sec: z.number().int().positive().max(3600).default(300) });

actuators.post('/actuators/:kind/command', async (req, res) => {
  const parsed = cmd.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const { action, ttl_sec } = parsed.data;
  await q(`INSERT INTO commands (house_id,actuator,action,ttl_sec) VALUES ($1,$2,$3,$4)`,
    [req.query.house ?? 'house-01', req.params.kind, action, ttl_sec]);
  sendCommand(req.params.kind, action, ttl_sec);
  res.json({ ok: true });
});
