import type { Config } from "tailwindcss";

/** Extends from the design tokens only. The default Tailwind palette is not used. */
export default {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bone: "var(--bone)", paper: "var(--paper)", "paper-2": "var(--paper-2)",
        ink: "var(--ink)", "ink-2": "var(--ink-2)", "ink-3": "var(--ink-3)",
        rule: "var(--rule)", "rule-2": "var(--rule-2)", "rule-3": "var(--rule-3)",
        vermilion: "var(--vermilion)", "vermilion-2": "var(--vermilion-2)",
        pine: "var(--pine)", brick: "var(--brick)", ochre: "var(--ochre)",
      },
      maxWidth: { content: "1200px", bar: "1160px" },
    },
  },
  plugins: [],
} satisfies Config;
