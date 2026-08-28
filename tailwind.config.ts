import type { Config } from "tailwindcss";

const hardShadow = "4px 4px 0 0 #000000";

export default {
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-geist-sans)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        hard: hardShadow,
        sm: hardShadow,
        DEFAULT: hardShadow,
        md: hardShadow,
        lg: hardShadow,
        xl: hardShadow,
        "2xl": hardShadow,
      },
    },
  },
} satisfies Config;
