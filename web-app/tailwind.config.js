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
          50: '#f3f8ff',
          100: '#d8e5ff',
          200: '#9cb6db',
          300: '#6c87aa',
          400: '#8fa2c2',
          500: '#637595',
          600: '#44526c',
          700: '#22304a',
          800: '#141d33',
          900: '#0b1220',
          950: '#060b14',
        },
        accent: {
          primary: '#5cf2da',
          secondary: '#1de6ff',
          blue: '#2f6bff',
          blueDark: '#2157dc',
          info: '#4fdfff',
          danger: '#ff5f7a',
          success: '#44d6a8',
          warning: '#ffb547',
        }
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['Sora', 'sans-serif'],
      },
      boxShadow: {
        'glass': '0 20px 60px rgba(3, 10, 24, 0.28)',
        'glass-dark': '0 32px 90px rgba(2, 8, 23, 0.52)',
        'glow': '0 0 40px rgba(79, 223, 255, 0.18)',
        'panel': '0 24px 70px rgba(2, 8, 23, 0.46)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'pulse-soft': 'pulseSoft 3s infinite ease-in-out',
        'float-slow': 'floatSlow 12s ease-in-out infinite',
        'shimmer-slow': 'shimmerSlow 8s linear infinite',
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
        floatSlow: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0)' },
          '50%': { transform: 'translate3d(0, -14px, 0)' },
        },
        shimmerSlow: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '100% 50%' },
        },
      },
    },
  },
  plugins: [],
}
