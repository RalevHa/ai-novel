import { ratingNote, showsText, type ContentRating } from './rating'
import { esc } from './xml'

type Card = { title: string; description: string; image?: string; url: string; siteName?: string }

type Story = { title: string; synopsis: string; coverImage: string; contentRating: ContentRating; warnings: string }
type Chapter = { title: string; excerpt: string }

/** What the card of a story (or one of its chapters, `no`) says. An 18+ story shows only its age note: no excerpt, synopsis or cover. `base` is the public origin. */
export function cardFor(s: Story, ch: Chapter | undefined, no: number | undefined, storyId: number, base: string): Card {
  // chapters usually open with their own title line ("# title" or "ชื่อตอน: title"); the card already shows it, so start the blurb at the prose
  const blurb = ch && (ch.title && ch.excerpt.split('\n')[0].includes(ch.title) ? ch.excerpt.replace(/^.*\n+/, '') : ch.excerpt)
  const open = showsText(s.contentRating)
  return {
    // story first: unfurlers cut long titles at the end, and the story name is the part that must survive
    title: ch ? `${s.title} · ${ch.title || `ตอนที่ ${no}`}` : s.title,
    description: open ? blurb ?? s.synopsis : ratingNote(s.contentRating, s.warnings),
    url: `${base}/story/${storyId}${ch ? `/read/${no}` : ''}`,
    image: open && s.coverImage ? `${base}/api/uploads/${s.coverImage}` : undefined,
  }
}

/** Link-preview card: link unfurlers (LINE, Facebook, X, Slack) read these tags without running JavaScript; people get sent on to the real page. `url` and `image` are absolute. */
export function ogPage({ title, description, image, url, siteName = 'AI Novel' }: Card) {
  const d = description.replace(/^[#>]+\s*/gm, '').replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const meta = [['og:type', 'article'], ['og:site_name', siteName], ['og:title', title], ['og:description', d], ['og:url', url], ...(image ? [['og:image', image]] : [])]
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="description" content="${esc(d)}">
${meta.map(([p, c]) => `<meta property="${p}" content="${esc(c)}">`).join('\n')}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<link rel="canonical" href="${esc(url)}">
<meta http-equiv="refresh" content="0;url=${esc(url)}">
</head><body><a href="${esc(url)}">${esc(title)}</a></body></html>`
}
