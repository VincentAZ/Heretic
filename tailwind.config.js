/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#07080c',
          900: '#0c0e14',
          850: '#11141d',
          800: '#161a26',
          700: '#1f2536',
          600: '#2b334a',
        },
        heretic: {
          cyan: '#00f0ff',
          magenta: '#ff2a85',
          violet: '#8b5cf6',
          amber: '#f59e0b',
          emerald: '#10b981',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      }
    },
  },
  plugins: [],
}
