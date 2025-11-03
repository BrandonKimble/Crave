module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#FF6B6B', // Custom primary color
        secondary: '#4ECDC4', // Custom secondary color
        background: '#F7F7F7', // Background color
        surface: '#FFFFFF', // Surface background
        text: '#1A1A1A', // Main text color
        muted: '#6B7280', // Muted text
        border: '#E5E7EB', // Border color
      },
    },
  },
};
