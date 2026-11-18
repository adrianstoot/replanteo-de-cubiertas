/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      colors: {
        cad: {
          bg: '#121821',
          panel: '#18202c',
          surface: '#1d2736',
          elevated: '#243042',
          border: '#2c3a4f',
          accent: '#2b6cb0',
          accentBright: '#3b82f6',
          green: '#4ea752',
        },
      },
    },
  },
  plugins: [],
};
