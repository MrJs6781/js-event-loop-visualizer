const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        raised: v('raised'),
        line: v('line'),
        ink: v('ink'),
        muted: v('muted'),
        stack: v('lane-stack'),
        api: v('lane-api'),
        task: v('lane-task'),
        micro: v('lane-micro'),
        render: v('lane-render'),
        tick: v('lane-tick'),
        danger: v('danger'),
      },
      fontFamily: {
        ui: ['var(--font-ui)'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
