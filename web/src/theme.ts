import { computed, ref } from 'vue'
import { lsGet, lsSet } from './ls'

export const THEMES = [{ k: 'paper', n: 'ขาว' }, { k: 'sepia', n: 'ซีเปีย' }, { k: 'ink', n: 'มืด' }] as const
export type ThemeName = (typeof THEMES)[number]['k']

const stored = lsGet('theme') as ThemeName | null
export const theme = ref<ThemeName>(
  stored && THEMES.some(t => t.k === stored) ? stored : matchMedia('(prefers-color-scheme: dark)').matches ? 'ink' : 'paper',
)
export const isDark = computed(() => theme.value === 'ink')

// browser UI colour (address bar on phones) = the page background of each theme; keep in step with --c-bg in styles.css
const BAR: Record<ThemeName, string> = { paper: '#f3f4f1', sepia: '#f1e7d3', ink: '#0f1624' }
const paint = (t: ThemeName) => {
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', BAR[t])
}

export function setTheme(t: ThemeName) {
  theme.value = t
  paint(t)
  lsSet('theme', t)
}
export const toggleTheme = () => setTheme(isDark.value ? 'paper' : 'ink')

paint(theme.value)
