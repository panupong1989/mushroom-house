import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class', // บังคับ light mode เสมอ — ไม่ผูก dark variant กับ prefers-color-scheme เด็ดขาด (ดู app/layout.tsx)
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        leaf: '#2FA96A',
        'leaf-dark': '#248A56',
        bg: '#E7EEE6',
        card: '#FFFFFF',
        gold: '#E3A73A',
        warn: '#E39A2A',
        danger: '#E4573B',
      },
      fontFamily: {
        sans: ['var(--font-ibm-plex-sans-thai)', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 12px 30px -10px rgba(25, 60, 40, 0.16), 0 3px 10px -3px rgba(25, 60, 40, 0.08)',
        'soft-sm': '0 6px 16px -6px rgba(25, 60, 40, 0.14), 0 2px 5px -2px rgba(25, 60, 40, 0.06)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
};

export default config;
