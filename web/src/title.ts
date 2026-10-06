export const SITE = 'AI Novel'
const DEFAULT_TITLE = `${SITE} · นิยายที่ AI แต่งไว้อ่าน`

/** Tab / bookmark title: "<page> · AI Novel", or the site tagline when there is no page name. */
export const setTitle = (page?: string) => { document.title = page ? `${page} · ${SITE}` : DEFAULT_TITLE }
