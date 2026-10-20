import { ref } from 'vue'

// An admin can look at the site as a writer or a reader. The server still sees the admin, so the preview is read-only:
// every request except GET (and logging out) is refused here, before it leaves the browser.
export type ViewAs = 'user' | 'writer'
const KEY = 'viewAs'

const read = (): ViewAs | null => { try { const v = sessionStorage.getItem(KEY); return v === 'user' || v === 'writer' ? v : null } catch { return null } }
export const viewAs = ref<ViewAs | null>(read())

export function setViewAs(v: ViewAs | null) {
  viewAs.value = v
  try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY) } catch { /* the preview then lasts until the page is reloaded */ }
}

export const PREVIEW_MSG = 'กำลังดูในมุมมองจำลอง ทำรายการไม่ได้ กด "ออก" ที่แถบด้านล่างก่อน'

export const guardedFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const url = input instanceof Request ? input.url : String(input)
  if (viewAs.value && method !== 'GET' && method !== 'HEAD' && !url.endsWith('/api/auth/logout')) return Promise.resolve(new Response(PREVIEW_MSG, { status: 403 }))
  return fetch(input, init)
}
