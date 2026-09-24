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
          // 5.4:1 against white and at least 4.7:1 on every tint we use, so green text and white
          // text on green buttons both pass WCAG AA (the old #0E8F52 was 4.1:1).
          DEFAULT: '#0A7A45',
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
          DEFAULT: '#A8401F', // 5.1:1 on its tint
          tint: '#F7E7E1',
        },
      },
      fontFamily: {
        display: ['Orbitron', 'sans-serif'],
        body: ['Manrope', 'sans-serif'],
      },
      boxShadow: {
        'glow-green': '0 0 14px rgba(10,122,69,0.45)',
        'glow-volt': '0 0 26px rgba(212,255,61,0.5)',
      },
    },
  },
  plugins: [],
};
