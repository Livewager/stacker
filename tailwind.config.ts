import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Satoshi", "system-ui", "sans-serif"],
      },
      colors: {
        background: "#020b18",
      },
    },
  },
  plugins: [],
};
export default config;
