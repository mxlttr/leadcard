import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0f1116",
        surface: "#151922",
        primary: "#00E676",
        negative: "#FF1744",
        foreground: "#f5f7fb",
        muted: "#a2acba",
        border: "#232936",
      },
      fontFamily: {
        body: ["var(--font-manrope)"],
        display: ["var(--font-space-grotesk)"],
      },
      boxShadow: {
        panel: "0 6px 16px rgba(0, 0, 0, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
