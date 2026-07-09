'use client';

import { useEffect } from 'react';

// ลงทะเบียน service worker (public/sw.js) สำหรับ PWA — ทำงานเฉพาะ production/https (+ localhost)
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* เงียบไว้ — SW ไม่ขึ้นก็ยังใช้เว็บได้ปกติ */
      });
    }
  }, []);
  return null;
}
