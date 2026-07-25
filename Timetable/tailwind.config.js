/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Fond principal
        app: {
          bg: '#F8FAFC',
          sidebar: '#0F172A',
        },
        // Verts (Libre / Succès)
        ttGreen: {
          50: '#F0FDF4',
          100: '#DCFCE7',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
        },
        // Rouges (Occupé / En cours)
        ttRed: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
        }
      },
      borderRadius: {
        'card': '16px',
      }
    },
  },
  plugins: [],
}