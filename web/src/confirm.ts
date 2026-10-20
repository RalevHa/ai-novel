import { ref } from 'vue'

export type ConfirmOptions = { title: string; body?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }

// one dialog for the whole app (rendered by ConfirmHost in App.vue); `await ask(...)` resolves true only when the user confirms
export const pending = ref<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)

export function ask(o: ConfirmOptions): Promise<boolean> {
  pending.value?.resolve(false) // a second question replaces the first
  return new Promise(resolve => { pending.value = { ...o, resolve } })
}

export function answer(ok: boolean) {
  pending.value?.resolve(ok)
  pending.value = null
}
