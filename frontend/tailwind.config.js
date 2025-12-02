/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'charcoal': '#222222',
        'gray-medium': '#888888',
        'coral': '#FF6F61',
      },
      fontFamily: {
        'sans': ['Open Sans', 'system-ui', 'sans-serif'],
        'serif': ['Lora', 'Georgia', 'serif'],
        'display': ['Montserrat', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} 