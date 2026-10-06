import MarkdownIt from 'markdown-it'

// Chapter text is Markdown. Raw HTML is off, and the only images allowed are our own uploads,
// so an AI-written or pasted chapter cannot pull in external images/trackers or inject markup.
//
// Image layout rides on standard Markdown so every other renderer still shows a plain image:
//   ![alt](/api/uploads/<name>#w=50&a=left "caption")
//   w = width in % (30|50|75|100, omitted = natural size), a = align (left|right, omitted = center), title = caption
const OWN_IMAGE = /^\/api\/uploads\/[0-9a-f-]{36}\.(png|jpg|webp)(#[\w=&]*)?$/
export const IMAGE_WIDTHS = [30, 50, 75, 100] as const
export const IMAGE_ALIGNS = ['left', 'center', 'right'] as const

/** Split "name.webp#w=50&a=left" into the file path and its validated layout. */
export function parseImageSrc(src: string) {
  const [path, frag = ''] = src.split('#')
  const p = new URLSearchParams(frag)
  const w = Number(p.get('w'))
  const a = p.get('a')
  return {
    path,
    width: (IMAGE_WIDTHS as readonly number[]).includes(w) ? w : null,
    align: (IMAGE_ALIGNS as readonly string[]).includes(a ?? '') ? (a as (typeof IMAGE_ALIGNS)[number]) : 'center',
  }
}

const md = new MarkdownIt({ html: false, linkify: false, breaks: false, typographer: false })

// A paragraph that holds only images becomes block-level <figure>s (no empty <p> around them);
// an image inside a sentence stays inline.
md.core.ruler.after('inline', 'figure_images', state => {
  const t = state.tokens
  for (let i = 0; i + 2 < t.length; i++) {
    if (t[i].type !== 'paragraph_open' || t[i + 1].type !== 'inline' || t[i + 2].type !== 'paragraph_close') continue
    const kids = t[i + 1].children ?? []
    const onlyImages = kids.some(k => k.type === 'image') && kids.every(k => k.type === 'image' || k.type === 'softbreak' || (k.type === 'text' && !k.content.trim()))
    if (!onlyImages) continue
    t[i].hidden = t[i + 2].hidden = true
    kids.forEach(k => { if (k.type === 'image') k.meta = { block: true } })
  }
})

md.renderer.rules.image = (tokens, i, opts, env, self) => {
  const t = tokens[i]
  const src = String(t.attrGet('src') ?? '')
  if (!OWN_IMAGE.test(src)) return ''
  const { path, width, align } = parseImageSrc(src)
  const alt = md.utils.escapeHtml(self.renderInlineAsText(t.children ?? [], opts, env))
  const img = `<img src="${md.utils.escapeHtml(path)}" alt="${alt}" loading="lazy" decoding="async">`
  if (!t.meta?.block) return img
  const caption = String(t.attrGet('title') ?? '').trim()
  return `<figure class="fig fig-w${width ?? 'auto'} fig-${align}">${img}${caption ? `<figcaption>${md.utils.escapeHtml(caption)}</figcaption>` : ''}</figure>\n`
}
md.renderer.rules.link_open = (tokens, i, opts, _env, self) => {
  tokens[i].attrSet('target', '_blank')
  tokens[i].attrSet('rel', 'noopener noreferrer')
  return self.renderToken(tokens, i, opts)
}

/** Remove images that are not our own uploads, so the editor never fetches (or keeps) external images. */
export const dropForeignImages = (markdown: string) =>
  markdown.replace(/!\[[^\]]*\]\(\s*([^)\s"]*)(?:[^)"]|"[^"]*")*\)/g, (m, src: string) => (OWN_IMAGE.test(src) ? m : ''))

/** Markdown to safe HTML. The model usually repeats the chapter title as the first line; the page header already shows it. */
export function renderChapter(markdown: string, title = '') {
  const lines = markdown.split('\n')
  const first = lines.findIndex(l => l.trim() !== '')
  if (first !== -1 && title && lines[first].replace(/^#+\s*/, '').trim() === title.trim()) lines.splice(first, 1)
  return md.render(lines.join('\n'))
}
