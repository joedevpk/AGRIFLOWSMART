/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Agriculture Green — identité principale AgriFlow RDC
        brand: {
          50: '#EEF4EA',   // Soft Sage (teinte claire)
          100: '#D9EACB',
          200: '#B9DAA5',
          300: '#A8C69F',   // Soft Sage
          400: '#5E9F45',  // Fresh Green
          500: '#4C9638',
          600: '#2F6B3B',  // Agriculture Green
          700: '#265A31',
          800: '#1D4A29',
          900: '#163A24',  // Forest Green
          950: '#0D2415',
        },
        // Orange / Harvest — CTA, prix, disponibilité
        accent: {
          50: '#FFF8E9',
          100: '#FDEBC3',
          200: '#FADB92',
          300: '#F6C863',
          400: '#E99A24',  // Harvest Orange
          500: '#E8B84A',  // Warm gold
          600: '#D98E10',
          700: '#B5720B',
        },
        cream: '#F5F0E6',    // Warm Cream — fonds de section
        offwhite: '#FCFBF7', // Off White — fonds de carte
        sage: '#E6EEDF',     // Soft Sage
        charcoal: '#20251F', // texte fort / fonds sombres
        // Surfaces du mode sombre (vert-noir, pas un simple inversé)
        night: { 900: '#0E150F', 800: '#141D16', 700: '#1B271D' },
      },
      fontFamily: {
        sans: ['Manrope', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl2: '20px',
        '3xl': '28px',
        '4xl': '32px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(23, 59, 36, 0.06), 0 8px 24px -12px rgba(23, 59, 36, 0.18)',
        'card-hover': '0 4px 12px rgba(23, 59, 36, 0.08), 0 20px 40px -16px rgba(23, 59, 36, 0.28)',
        lift: '0 12px 32px -8px rgba(23, 59, 36, 0.35)',
      },
      transitionDuration: { 250: '250ms' },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'fade-up': 'fadeUp 0.5s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        float: 'float 5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
    },
  },
  plugins: [],
};
