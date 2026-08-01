import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        steel: "#415466",
        mist: "#e7eef4",
        paper: "#f8fafc",
        accent: "#0f766e",
        warning: "#b45309",
        danger: "#b91c1c"
      },
      boxShadow: {
        panel: "0 14px 40px rgb(15 23 42 / 0.10)"
      }
    }
  },
  plugins: []
} satisfies Config;
