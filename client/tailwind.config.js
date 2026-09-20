/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F5F4EE',
        surface: '#FFFFFF',
        ink: '#12211C',
        'ink-2': '#55665C',
        border: '#E3E1D6',
        green: {
          DEFAULT: '#0E8F52',
          dark: '#0C2418',
          tint: '#E1F5EA',
        },
        volt: {
          DEFAULT: '#D4FF3D',
          ink: '#1C2B12',
        },
        sage: {
          DEFAULT: '#9AA39C',
          tint: '#EEF0EC',
        },
        terracotta: {
          DEFAULT: '#B4482A',
          tint: '#F7E7E1',
        },
      },
      fontFamily: {
        display: ['Orbitron', 'sans-serif'],
        body: ['Manrope', 'sans-serif'],
      },
      boxShadow: {
        'glow-green': '0 0 14px rgba(14,143,82,0.45)',
        'glow-volt': '0 0 26px rgba(212,255,61,0.5)',
      },
    },
  },
  plugins: [],
};
