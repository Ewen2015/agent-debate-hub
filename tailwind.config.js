/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#0B0F1A',
          800: '#111726',
          700: '#1A2236',
          600: '#252F45',
          500: '#384359',
        },
        gold: {
          50: '#FBF4E2',
          100: '#F5E5B8',
          200: '#EED18A',
          300: '#E8B14C',
          400: '#D49528',
          500: '#A8761A',
        },
        cyan: {
          300: '#7AECCF',
          400: '#5FE0C7',
          500: '#3BB69E',
        },
        rose: {
          300: '#F89395',
          400: '#F47174',
          500: '#D44C50',
        },
        violet: {
          300: '#B6A8FF',
          400: '#9A8CFF',
          500: '#7565D6',
        },
        cream: {
          50: '#FAF7F0',
          100: '#F1ECDF',
        },
      },
      fontFamily: {
        serif: ['"Fraunces"', '"Noto Serif SC"', 'Georgia', 'serif'],
        sans: ['"Inter Tight"', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
        cnserif: ['"Noto Serif SC"', 'serif'],
        cnsans: ['"Noto Sans SC"', 'sans-serif'],
      },
      letterSpacing: {
        tightish: '-0.01em',
        tightish2: '-0.02em',
        widish: '0.04em',
        widest2: '0.18em',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(232,177,76,0.25), 0 0 30px -8px rgba(232,177,76,0.45)',
        card: '0 8px 32px -16px rgba(0,0,0,0.6), 0 1px 0 0 rgba(255,255,255,0.04) inset',
        ring: '0 0 0 1px rgba(232,177,76,0.35)',
        elev: '0 1px 0 0 rgba(15,23,42,0.04), 0 4px 12px -4px rgba(15,23,42,0.08)',
        float: '0 8px 32px -6px rgba(15,23,42,0.12)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      animation: {
        'pulse-soft': 'pulse-soft 2.2s cubic-bezier(0.4,0,0.6,1) infinite',
        'spin-slow': 'spin 12s linear infinite',
        'fade-up': 'fadeUp 0.5s ease-out',
        'reveal': 'reveal 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) forwards',
        'shimmer': 'shimmer 3s linear infinite',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        reveal: {
          from: { opacity: '0', transform: 'translateY(14px) scale(0.99)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
