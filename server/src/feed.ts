import { esc } from './xml'

type Story = { id: number; title: string; synopsis: string }
type Item = { no: number; title: string; excerpt: string; at: Date }

/** Atom feed of a story's newest chapters. `base` is the public origin of the web app (no trailing slash). */
export function atomFeed(story: Story, items: Item[], base: string) {
  const link = `${base}/story/${story.id}`
  const updated = (items[0]?.at ?? new Date()).toISOString()
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="th">
<id>${link}</id>
<title>${esc(story.title)}</title>
${story.synopsis ? `<subtitle>${esc(story.synopsis)}</subtitle>\n` : ''}<updated>${updated}</updated>
<link rel="alternate" href="${link}"/>
<link rel="self" href="${link}/feed.xml"/>
${items.map(i => `<entry>
<id>${link}/read/${i.no}</id>
<title>${esc(i.title || `ตอนที่ ${i.no}`)}</title>
<link rel="alternate" href="${link}/read/${i.no}"/>
<updated>${i.at.toISOString()}</updated>
<summary>${esc(i.excerpt.replace(/\s+/g, ' ').trim())}…</summary>
</entry>`).join('\n')}
</feed>`
}
