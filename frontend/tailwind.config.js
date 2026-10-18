/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#080d19',
        panel: '#0f1626',
        panel2: '#151f35',
        line: '#212d49',
        muted: '#8592ad',
        brand: '#34d3c1',
        violet: '#8b7cf6',
      },
      fontFamily: { sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] },
      keyframes: {
        rise: { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
        pop: { from: { opacity: 0, transform: 'scale(.97)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: { rise: 'rise .35s ease-out both', pop: 'pop .18s ease-out both' },
    },
  },
  plugins: [],
}
