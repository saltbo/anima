/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        app: {
          bg: '#0f0f0f',
          sidebar: '#141414',
          surface: '#1c1c1c',
          border: '#2a2a2a',
          'text-primary': '#e5e5e5',
          'text-secondary': '#888888',
          accent: '#6366f1',
        },
        status: {
          sleeping: '#888888',
          checking: '#f59e0b',
          awake: '#10b981',
          paused: '#ef4444',
          'rate-limited': '#f97316',
        }
      }
    }
  },
  plugins: []
}
