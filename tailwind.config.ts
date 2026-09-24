import type { Config } from "tailwindcss";

/** Legacy JS config kept for tooling; theme tokens live in `src/app/globals.css` (`@theme`). */
export default {
  theme: {
    extend: {},
  },
} satisfies Config;
