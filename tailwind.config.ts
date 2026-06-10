import type { Config } from "tailwindcss";

// Harbor Bistro brand tokens. Harbor Bistro is a fictional client of
// Paradigm Coding Solutions and carries its OWN identity; do not import
// Paradigm colors here except for the attribution banner tokens below.
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        harbor: {
          teal: "#1c4e54", // primary
          "teal-deep": "#143a3f", // hover / pressed
          "teal-mist": "#e3edee", // tinted surfaces on cream
          cream: "#f8f1e4", // page background
          "cream-deep": "#efe5d2", // cards, alt sections
          coral: "#d9744a", // accent, CTAs
          "coral-deep": "#c05f37", // CTA hover
          ink: "#2c1f1a", // body text
          "ink-soft": "#5c4a40", // secondary text
          line: "#dccdb4", // hairlines, borders
        },
        paradigm: {
          green: "#1f5a44",
          paper: "#f7f5f0",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        warm: "0 2px 12px rgba(44, 31, 26, 0.08)",
        "warm-lg": "0 8px 32px rgba(44, 31, 26, 0.14)",
      },
      maxWidth: {
        site: "72rem",
      },
    },
  },
  plugins: [],
};
export default config;
