// Supabase client สำหรับโหมด Internet — ดู supabase/README.md
// ใช้ anon key เท่านั้น (public โดยตั้งใจ ผ่าน RLS คุมสิทธิ์) ห้ามใส่ service_role ที่นี่เด็ดขาด
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = SUPABASE_ENABLED
  ? createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string)
  : null;
