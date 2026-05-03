import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "ui-serif", "serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "gradient-flow": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        /** 首页 Logo 区：轻微上浮 + 阴影呼吸 */
        "logo-breathe": {
          "0%, 100%": {
            transform: "translateY(0) scale(1)",
            boxShadow: "0 1px 3px 0 hsl(168 32% 42% / 0.06)",
          },
          "50%": {
            transform: "translateY(-7px) scale(1.02)",
            boxShadow: "0 14px 32px -10px hsl(168 32% 42% / 0.2)",
          },
        },
        /** Logo 内飞机图标：小幅摆角 */
        "plane-sway": {
          "0%, 100%": { transform: "rotate(-2.5deg)" },
          "50%": { transform: "rotate(2.5deg)" },
        },
        /** 功能卡入场 */
        "card-enter": {
          "0%": { opacity: "0", transform: "translateY(18px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        /** 工作台节点：轻微呼吸 */
        "node-breathe": {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.05)", opacity: "0.88" },
        },
      },
      animation: {
        "fade-in": "fade-in 320ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
        "gradient-flow": "gradient-flow 14s ease-in-out infinite",
        "logo-breathe": "logo-breathe 4.8s ease-in-out infinite",
        "plane-sway": "plane-sway 3.2s ease-in-out infinite",
        "card-enter": "card-enter 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        "node-breathe": "node-breathe 2.4s ease-in-out infinite",
      },
      transitionTimingFunction: {
        soft: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
