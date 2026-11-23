/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        primary: "var(--primary)",
        "primary-foreground": "var(--primary-foreground)",
        border: "var(--border)",
        ring: "var(--ring)",
        destructive: "var(--destructive)",
        overlay: "var(--overlay)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      fontSize: {
        xs: ["12px", "1.5"],
        sm: ["14px", "1.6"],
      },
      /**
       * 悬浮岛高度。
       *
       * 52px 是 Tailwind 默认间距刻度里没有的档位（12 = 48px，
       * 14 = 56px），但底部悬浮岛正好需要它——比 56px 矮一点，
       * 视觉上更贴地。
       */
      spacing: {
        13: "52px",
      },
    },
  },
  plugins: [],
};
