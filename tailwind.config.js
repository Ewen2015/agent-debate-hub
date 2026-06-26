/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        clay: {
          50: '#FBF5F1',
          100: '#F5E6DD',
          200: '#ECC9B8',
          300: '#E0A58A',
          400: '#D97757',
          500: '#C46A4A',
          600: '#A8563A',
          700: '#8A4530',
        },
        violet: {
          50: '#F3F0FF',
          100: '#E4DEFF',
          200: '#C9BDFF',
          300: '#A791F0',
          400: '#8B73E6',
          500: '#735BD4',
          600: '#5E49BF',
          700: '#4A39A0',
        },
        emerald: {
          300: '#A3C289',
          400: '#8DB86A',
          500: '#7BA05B',
        },
        rose: {
          300: '#ED9B9B',
          400: '#E47777',
          500: '#D45B5B',
        },
        amber: {
          300: '#EECB77',
          400: '#E8B85C',
          500: '#D4A03C',
        },
        cream: {
          50: '#FAF9F5',
          100: '#F5F3EE',
          200: '#EDEBE3',
        },
      },
      fontFamily: {
        serif: ['"Newsreader"', '"Noto Serif SC"', 'Georgia', 'serif'],
        sans: ['"Poppins"', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
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
        glow: '0 0 0 1px rgba(217,119,87,0.25), 0 0 30px -8px rgba(217,119,87,0.4)',
        card: '0 8px 32px -16px rgba(0,0,0,0.5), 0 1px 0 0 rgba(255,255,255,0.04) inset',
        ring: '0 0 0 1px rgba(217,119,87,0.35)',
        elev: '0 1px 0 0 rgba(27,27,25,0.03), 0 4px 12px -4px rgba(27,27,25,0.08)',
        float: '0 8px 32px -6px rgba(27,27,25,0.12)',
        primary: '0 4px 16px -4px rgba(217,119,87,0.4), 0 1px 0 0 rgba(255,255,255,0.2) inset',
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
