/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: 'var(--primary-50, #f8fafc)',
          100: 'var(--primary-100, #f4f5f6)',
          200: 'var(--primary-200, #e5e6e9)',
          300: 'var(--primary-300, #bfc1c7)',
          400: 'var(--primary-400, #93969e)',
          500: 'var(--primary-500, #686b74)',
          600: 'var(--primary-600, #42454d)',
          700: 'var(--primary-700, #2d2f36)',
          800: 'var(--primary-800, #1c1d22)',
          900: 'var(--primary-900, #111216)',
          950: 'var(--primary-950, #0a0a0c)', // Deep corporate black-blue
        },
        accent: {
          primary: '#0f172a', // Core dark brand
          secondary: '#1e293b',
          blue: '#2563eb', // Trust blue
          blueDark: '#1d4ed8',
          danger: '#E60012', // Limen Red
          success: '#10b981',
          warning: '#f59e0b',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(0, 0, 0, 0.08)',
        'glass-dark': '0 8px 32px rgba(0, 0, 0, 0.4)',
        'glow': '0 0 20px rgba(230, 0, 18, 0.2)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'pulse-soft': 'pulseSoft 3s infinite ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(30px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-15px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' },
        },
      },
    },
  },
  plugins: [],
}
