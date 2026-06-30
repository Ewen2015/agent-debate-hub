/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        clay: {
          50: '#F0F6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#0071E3',
          500: '#0058B0',
          600: '#004A93',
          700: '#003B73',
        },
        violet: {
          50: '#FAF5FF',
          100: '#F3E8FF',
          200: '#E9D5FF',
          300: '#D8B4FE',
          400: '#AF52DE',
          500: '#BF5AF2',
          600: '#9333EA',
          700: '#7E22CE',
        },
        emerald: {
          300: '#86EFAC',
          400: '#4ADE80',
          500: '#34C759',
        },
        rose: {
          300: '#FCA5A5',
          400: '#F87171',
          500: '#FF3B30',
        },
        amber: {
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#FF9500',
        },
        cream: {
          50: '#FFFFFF',
          100: '#F5F5F7',
          200: '#E5E5EA',
        },
      },
      fontFamily: {
        serif: ['"SF Pro Display"', '-apple-system', 'BlinkMacSystemFont', '"Helvetica Neue"', 'sans-serif'],
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', '"Helvetica Neue"', '"PingFang SC"', '"Noto Sans SC"', 'sans-serif'],
        mono: ['"SF Mono"', '"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
        cnserif: ['"PingFang SC"', '"Noto Serif SC"', 'serif'],
        cnsans: ['"PingFang SC"', '"Noto Sans SC"', 'sans-serif'],
      },
      letterSpacing: {
        tightish: '-0.01em',
        tightish2: '-0.02em',
        widish: '0.04em',
        widest2: '0.18em',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(0,113,227,0.25), 0 0 30px -8px rgba(0,113,227,0.4)',
        card: '0 8px 32px -16px rgba(0,0,0,0.5), 0 1px 0 0 rgba(255,255,255,0.04) inset',
        ring: '0 0 0 1px rgba(0,113,227,0.35)',
        elev: '0 1px 0 0 rgba(0,0,0,0.03), 0 4px 12px -4px rgba(0,0,0,0.08)',
        float: '0 8px 32px -6px rgba(0,0,0,0.12)',
        primary: '0 4px 16px -4px rgba(0,113,227,0.35), 0 1px 0 0 rgba(255,255,255,0.2) inset',
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.5rem',
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
