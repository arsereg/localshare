/**
 * Tailwind CSS configuration for the collaborative editor
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./guest.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        editor: {
          bg: '#1e1e1e',
          sidebar: '#252526',
          active: '#37373d',
          border: '#3c3c3c',
          text: '#cccccc',
          accent: '#007acc',
          success: '#4ec9b0',
          warning: '#dcdcaa',
          error: '#f14c4c',
        },
      },
      fontFamily: {
        mono: ['Consolas', 'Monaco', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
};
