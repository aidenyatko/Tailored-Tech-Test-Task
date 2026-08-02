import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#07080d",
        panel: "#11131f",
        ghost: "#f5f7ff",
        ink: "#f5f7ff",
        steel: "#9aa4bd",
        mist: "#28314a",
        paper: "#11131f",
        accent: "#fcee09",
        "neon-yellow": "#fcee09",
        "neon-cyan": "#00f0ff",
        "neon-pink": "#ff2a6d",
        "neon-lime": "#b8ff2c",
        warning: "#f97316",
        danger: "#ff2a6d"
      },
      boxShadow: {
        panel: "0 22px 70px rgb(0 240 255 / 0.14)"
      }
    }
  },
  plugins: []
} satisfies Config;
