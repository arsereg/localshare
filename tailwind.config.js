/**
 * Tailwind CSS Configuration
 * Refined Dark Terminal Theme
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,ts,tsx,js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Core backgrounds
        bg: {
          base: '#0c0c0e',
          surface: '#141417',
          elevated: '#1c1c21',
          hover: '#252529',
          active: '#2d2d33'
        },
        // Primary accent - refined teal
        accent: {
          primary: '#2dd4bf',
          'primary-dim': 'rgba(45, 212, 191, 0.15)',
          secondary: '#f97066',
          'secondary-dim': 'rgba(249, 112, 102, 0.15)',
          tertiary: '#a78bfa',
          'tertiary-dim': 'rgba(167, 139, 250, 0.15)'
        },
        // Text hierarchy
        text: {
          primary: '#f4f4f5',
          secondary: '#a1a1aa',
          tertiary: '#71717a',
          disabled: '#52525b'
        },
        // Status colors
        status: {
          success: '#34d399',
          warning: '#fbbf24',
          error: '#f87171',
          info: '#60a5fa'
        },
        // Border colors
        border: {
          subtle: 'rgba(255, 255, 255, 0.04)',
          DEFAULT: 'rgba(255, 255, 255, 0.08)',
          emphasis: 'rgba(255, 255, 255, 0.12)',
          focus: 'rgba(45, 212, 191, 0.5)'
        }
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', '"SF Mono"', '"Fira Code"', 'monospace'],
        ui: ['"Instrument Sans"', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif']
      },
      fontSize: {
        'xs': ['11px', { lineHeight: '1.4' }],
        'sm': ['12px', { lineHeight: '1.5' }],
        'base': ['13px', { lineHeight: '1.5' }],
        'lg': ['14px', { lineHeight: '1.5' }],
        'xl': ['16px', { lineHeight: '1.4' }],
        '2xl': ['20px', { lineHeight: '1.3' }],
        '3xl': ['24px', { lineHeight: '1.2' }]
      },
      spacing: {
        '4.5': '1.125rem',
        '13': '3.25rem',
        '15': '3.75rem'
      },
      borderRadius: {
        'xs': '4px',
        'sm': '6px',
        DEFAULT: '8px',
        'md': '10px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px'
      },
      boxShadow: {
        'sm': '0 1px 2px rgba(0, 0, 0, 0.3)',
        'md': '0 4px 12px rgba(0, 0, 0, 0.4)',
        'lg': '0 8px 24px rgba(0, 0, 0, 0.5)',
        'xl': '0 16px 48px rgba(0, 0, 0, 0.6)',
        'glow': '0 0 20px rgba(45, 212, 191, 0.25)',
        'glow-sm': '0 0 10px rgba(45, 212, 191, 0.2)',
        'inner-glow': 'inset 0 0 20px rgba(45, 212, 191, 0.08)'
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
        'slide-down': 'slide-down 0.2s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s ease-in-out infinite'
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' }
        },
        'shimmer': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' }
        }
      },
      backdropBlur: {
        xs: '4px'
      },
      transitionDuration: {
        '150': '150ms',
        '250': '250ms'
      }
    }
  },
  plugins: []
}
