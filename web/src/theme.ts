import { computed, ref } from 'vue'
import { lsGet, lsSet } from './ls'

export const THEMES = [{ k: 'paper', n: 'ขาว' }, { k: 'sepia', n: 'ซีเปีย' }, { k: 'ink', n: 'มืด' }] as const
export type ThemeName = (typeof THEMES)[number]['k']

const stored = lsGet('theme') as ThemeName | null
export const theme = ref<ThemeName>(
  stored && THEMES.some(t => t.k === stored) ? stored : matchMedia('(prefers-color-scheme: dark)').matches ? 'ink' : 'paper',
)
export const isDark = computed(() => theme.value === 'ink')

export function setTheme(t: ThemeName) {
  theme.value = t
  document.documentElement.dataset.theme = t
  lsSet('theme', t)
}
export const toggleTheme = () => setTheme(isDark.value ? 'paper' : 'ink')

document.documentElement.dataset.theme = theme.value
