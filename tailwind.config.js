/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#030b1a',
          900: '#071224',
          800: '#0a1628',
          700: '#0d1f38',
          600: '#102847',
          500: '#1a3355',
          400: '#2a4f7a',
        },
        steel: {
          600: '#4a6b8a',
          500: '#7ba3cc',
          400: '#a8c4de',
          300: '#c8ddef',
          200: '#e2edf8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
