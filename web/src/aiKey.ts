import { computed, ref } from 'vue'
import { lsGet, lsSet } from './ls'
import { useAuth } from './stores/auth'

// The writer's own OpenRouter key lives only in this browser (localStorage, one slot per user, cleared at logout) and travels with each AI
// request in the `x-ai-key` header. The server uses it for that request and keeps nothing.
const slot = (userId?: number) => `aiKey:${userId ?? useAuth().user?.id ?? 0}`
const changed = ref(0) // bumped on every change so the profile page and the editor banner follow along

export const getAiKey = () => { void changed.value; return lsGet(slot()) || '' }
export function setAiKey(key: string) { lsSet(slot(), key.trim()); changed.value++ }
export function clearAiKey(userId?: number) {
  try { localStorage.removeItem(slot(userId)) } catch { /* private mode: nothing was stored anyway */ }
  changed.value++
}

export const hasAiKey = computed(() => !!getAiKey())
export const aiKeyLast4 = computed(() => getAiKey().slice(-4))
/** Headers for any request that may call a model; empty when this browser has no key (admins then use the site's). */
export const aiHeaders = (): Record<string, string> => { const k = getAiKey(); return k ? { 'x-ai-key': k } : {} }
