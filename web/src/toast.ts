import { ref } from 'vue'

export type Toast = { id: number; text: string; kind: 'ok' | 'error' }
export const toasts = ref<Toast[]>([])
let n = 0

export function toast(text: string, kind: Toast['kind'] = 'ok') {
  const id = ++n
  toasts.value.push({ id, text, kind })
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, kind === 'error' ? 6000 : 3000)
}
export const toastError = (e: unknown) => toast((e as Error).message, 'error')
