import type { Config } from 'tailwindcss'

// Colours are CSS variables (see styles.css) so the paper / sepia / ink themes swap without `dark:` variants.
const c = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: { bg: c('bg'), surface: c('surface'), fg: c('fg'), line: c('line'), primary: c('primary'), 'on-primary': c('on-primary'), secondary: c('secondary'), success: c('success'), warning: c('warning'), danger: c('danger') },
      fontFamily: {
        sans: ['"IBM Plex Sans Thai"', 'system-ui', 'sans-serif'],
        serif: ['"Noto Serif Thai"', '"Shippori Mincho"', 'serif'],
        mincho: ['"Shippori Mincho"', '"Noto Serif Thai"', 'serif'],
      },
    },
  },
} satisfies Config
