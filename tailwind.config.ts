import type { Config } from "tailwindcss";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { heroui } = require("@heroui/react");

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic tokens — use these instead of hardcoded zinc-* values.
        // They automatically swap between light and dark themes.
        page:    "rgb(var(--color-bg) / <alpha-value>)",
        card:    "rgb(var(--color-card) / <alpha-value>)",
        input:   "rgb(var(--color-input) / <alpha-value>)",
        "border-base":   "rgb(var(--color-border) / <alpha-value>)",
        "border-strong": "rgb(var(--color-border-2) / <alpha-value>)",
        "th-primary":    "rgb(var(--color-text-1) / <alpha-value>)",
        "th-secondary":  "rgb(var(--color-text-2) / <alpha-value>)",
        "th-muted":      "rgb(var(--color-text-3) / <alpha-value>)",
        "th-subtle":     "rgb(var(--color-text-4) / <alpha-value>)",
      },
    },
  },
  darkMode: "class",
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  plugins: [heroui()],
};

export default config;
