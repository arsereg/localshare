/**
 * Tailwind CSS Configuration
 * Terminal/Hacker aesthetic with phosphor green accents
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Background hierarchy
        'terminal': {
          'deep': '#0a0e14',
          'base': '#0d1117',
          'surface': '#161b22',
          'elevated': '#1c2128',
          'hover': '#262c36'
        },
        // Primary phosphor green
        'phosphor': {
          'dim': '#004d40',
          'muted': '#00796b',
          'DEFAULT': '#00ff9f',
          'bright': '#69ffcc',
          'glow': 'rgba(0, 255, 159, 0.15)'
        },
        // Secondary cyan
        'cyber': {
          'dim': '#0e4f5c',
          'muted': '#6fc3df',
          'DEFAULT': '#00d9ff',
          'bright': '#7de8ff',
          'glow': 'rgba(0, 217, 255, 0.15)'
        },
        // Semantic colors
        'status': {
          'error': '#ff0055',
          'error-dim': '#660022',
          'warning': '#ffb800',
          'warning-dim': '#664a00',
          'success': '#00ff9f',
          'info': '#00d9ff'
        },
        // Text hierarchy
        'text': {
          'primary': '#e6edf3',
          'secondary': '#8b949e',
          'muted': '#484f58',
          'disabled': '#30363d'
        },
        // Borders
        'border': {
          'subtle': '#21262d',
          'DEFAULT': '#30363d',
          'emphasis': '#484f58'
        }
      },
      fontFamily: {
        'mono': ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        'ui': ['"Space Mono"', '"JetBrains Mono"', 'monospace']
      },
      fontSize: {
        'code': ['13px', { lineHeight: '1.6' }],
        'ui-sm': ['11px', { lineHeight: '1.4' }],
        'ui': ['12px', { lineHeight: '1.4' }],
        'ui-lg': ['14px', { lineHeight: '1.4' }]
      },
      spacing: {
        'gutter': '48px',
        'tab-height': '36px',
        'status-height': '24px'
      },
      boxShadow: {
        'glow-sm': '0 0 8px rgba(0, 255, 159, 0.3)',
        'glow': '0 0 16px rgba(0, 255, 159, 0.4)',
        'glow-lg': '0 0 24px rgba(0, 255, 159, 0.5)',
        'glow-cyan': '0 0 16px rgba(0, 217, 255, 0.4)',
        'inner-glow': 'inset 0 0 20px rgba(0, 255, 159, 0.1)',
        'elevated': '0 8px 24px rgba(0, 0, 0, 0.4)'
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'blink': 'blink 1s step-end infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'scanline': 'scanline 8s linear infinite',
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.2s ease-out',
        'slide-down': 'slide-down 0.15s ease-out'
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' }
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(0, 255, 159, 0.3)' },
          '50%': { boxShadow: '0 0 16px rgba(0, 255, 159, 0.6)' }
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' }
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      backgroundImage: {
        'grid-pattern': 'linear-gradient(rgba(0, 255, 159, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 159, 0.03) 1px, transparent 1px)',
        'scanlines': 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 0, 0, 0.1) 2px, rgba(0, 0, 0, 0.1) 4px)'
      },
      backgroundSize: {
        'grid': '20px 20px'
      }
    }
  },
  plugins: []
}
