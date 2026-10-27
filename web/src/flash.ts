import { nextTick } from 'vue'

/** Scrolls to the element with this id and rings it for a moment (opening a notification lands on one comment/review). False when it is not on the page. */
export async function flash(id: string) {
  await nextTick()
  const el = document.getElementById(id)
  if (!el) return false
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  const ring = ['rounded-lg', 'bg-primary/10', 'ring-2', 'ring-primary/60']
  el.classList.add(...ring)
  setTimeout(() => el.classList.remove(...ring), 2500)
  return true
}
