import pg from 'pg';
import { cfg } from '../config.js';
export const pool = new pg.Pool({ connectionString: cfg.databaseUrl });
export const q = (text: string, params?: unknown[]) => pool.query(text, params);
