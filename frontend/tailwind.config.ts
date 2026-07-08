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
        danger: '#E4573B',
      },
      fontFamily: {
        sans: ['var(--font-ibm-plex-sans-thai)', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 20px -4px rgba(47, 169, 106, 0.18)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
};

export default config;
