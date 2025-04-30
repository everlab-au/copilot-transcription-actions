/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./entrypoints/**/*.{js,jsx,ts,tsx,html}",
    "./src/**/*.{js,jsx,ts,tsx,html}",
  ],
  theme: {
    extend: {
      animation: {
        "pulse-tab": "pulse-tab 2s infinite",
      },
      keyframes: {
        "pulse-tab": {
          "0%, 100%": { backgroundColor: "transparent" },
          "50%": { backgroundColor: "rgba(239, 68, 68, 0.1)" },
        },
      },
    },
  },
  plugins: [],
};
