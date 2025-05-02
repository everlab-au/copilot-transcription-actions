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
        fadeInOut: "fadeInOut 60s forwards",
        spin: "spin 1s linear infinite",
      },
      keyframes: {
        "pulse-tab": {
          "0%, 100%": { backgroundColor: "transparent" },
          "50%": { backgroundColor: "rgba(239, 68, 68, 0.1)" },
        },
        fadeInOut: {
          "0%": { opacity: "1" },
          "90%": { opacity: "1" },
          "100%": { opacity: "0", visibility: "hidden" },
        },
        spin: {
          to: { transform: "rotate(360deg)" },
        },
      },
    },
  },
  plugins: [],
};
