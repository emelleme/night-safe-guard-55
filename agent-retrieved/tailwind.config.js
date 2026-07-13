module.exports = {
  content: ['./src/**/*.{js,md,twig,svg}'],
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('tailwindcss-debug-screens'),
    require('daisyui'),
  ],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
    },
    debugScreens: {
      position: ['bottom', 'right'],
    },
    extend: {},
  },
  daisyui: {
    themes: ["light", "dark", "night","luxury","aqua"],
  },
}
