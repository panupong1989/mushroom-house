import type { MetadataRoute } from 'next';

// Next.js สร้าง /manifest.webmanifest + แทรก <link rel="manifest"> ให้อัตโนมัติจากไฟล์นี้
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ระบบควบคุมโรงเพาะเห็ดฟาง',
    short_name: 'โรงเห็ดฟาง',
    description: 'Dashboard ตรวจสอบและควบคุมโรงเพาะเห็ดฟาง',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#E7EEE6',
    theme_color: '#2FA96A',
    lang: 'th',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
