/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#090a0d',
        panel: '#121419',
        blazers: '#e03a3e',
      },
    },
  },
  plugins: [],
}
