'use client';

import { useState } from 'react';
import { Card } from './Card';
import { supabase } from '@/lib/supabaseClient';
import type { Session } from '@supabase/supabase-js';

// หน้า login ง่ายๆ (Email+Password) — ไม่มีปุ่มสมัคร (สร้าง user ใน Supabase dashboard เท่านั้น)
export function LoginPanel({ session }: { session: Session | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) {
    return (
      <Card title="🔐 บัญชี">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate text-gray-600">เข้าสู่ระบบ: {session.user.email}</span>
          <button
            onClick={() => supabase?.auth.signOut()}
            className="shrink-0 rounded-xl2 bg-bg px-3 py-1 text-xs font-medium text-gray-600"
          >
            ออกจากระบบ
          </button>
        </div>
      </Card>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError('เข้าสู่ระบบไม่สำเร็จ — ตรวจอีเมล/รหัสผ่าน');
  }

  return (
    <Card title="🔐 เข้าสู่ระบบเพื่อสั่งงาน">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <input
          type="email"
          required
          autoComplete="username"
          placeholder="อีเมล"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl2 border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="รหัสผ่าน"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl2 border border-gray-200 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl2 bg-gray-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
        </button>
        {error && <p className="text-xs text-danger">{error}</p>}
        <p className="text-[11px] text-gray-400">ดูข้อมูลได้โดยไม่ต้องล็อกอิน — ล็อกอินเฉพาะเวลาสั่งงาน/แก้ตั้งค่า</p>
      </form>
    </Card>
  );
}
