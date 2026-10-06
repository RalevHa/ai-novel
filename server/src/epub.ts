import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import MarkdownIt from 'markdown-it'
import { UPLOAD_DIR } from './uploads'

type Entry = { name: string; data: string | Uint8Array; store?: boolean }
type Field = [value: number, bytes: 2 | 4]

/** Header record: 4-byte signature followed by little-endian fields. */
function record(sig: number, fields: Field[]) {
  const b = Buffer.alloc(4 + fields.reduce((n, [, w]) => n + w, 0))
  b.writeUInt32LE(sig)
  let o = 4
  for (const [v, w] of fields) { if (w === 2) b.writeUInt16LE(v, o); else b.writeUInt32LE(v, o); o += w }
  return b
}

/** Minimal ZIP writer (deflate, or stored for `store`). Fixed timestamps keep the output reproducible. */
export function zip(entries: Entry[]) {
  const parts: Buffer[] = [], central: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const raw = Buffer.from(e.data as string | Uint8Array)
    const body = e.store ? raw : deflateRawSync(raw)
    const name = Buffer.from(e.name)
    // flags 0x0800 = UTF-8 names; date 0x21 = 1980-01-01
    const common: Field[] = [[0x0800, 2], [e.store ? 0 : 8, 2], [0, 2], [0x21, 2], [Bun.hash.crc32(raw), 4], [body.length, 4], [raw.length, 4], [name.length, 2], [0, 2]]
    parts.push(record(0x04034b50, [[20, 2], ...common]), name, body)
    central.push(record(0x02014b50, [[20, 2], [20, 2], ...common, [0, 2], [0, 2], [0, 2], [0, 4], [offset, 4]]), name)
    offset += 30 + name.length + body.length
  }
  const cd = Buffer.concat(central)
  const end = record(0x06054b50, [[0, 2], [0, 2], [entries.length, 2], [entries.length, 2], [cd.length, 4], [offset, 4], [0, 2]])
  return Buffer.concat([...parts, cd, end])
}

const UPLOAD_REF = /^\/api\/uploads\/([0-9a-f-]{36}\.(png|jpg|webp))(?:#([\w=&]*))?$/
const MEDIA: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }
const onDisk = (name: string) => existsSync(join(UPLOAD_DIR, name))

// Same rules as the web reader (no raw HTML, only our own uploads), but emitting XHTML for EPUB.
const md = new MarkdownIt({ html: false, linkify: false, xhtmlOut: true })
md.renderer.rules.image = (tokens, i, opts, env, self) => {
  const t = tokens[i], m = UPLOAD_REF.exec(String(t.attrGet('src') ?? ''))
  if (!m || !onDisk(m[1])) return '' // foreign or deleted images would be dangling references in the package
  ;(env as { images: Set<string> }).images.add(m[1])
  const w = Number(new URLSearchParams(m[3]).get('w'))
  const alt = md.utils.escapeHtml(self.renderInlineAsText(t.children ?? [], opts, env))
  return `<img src="images/${m[1]}" alt="${alt}"${[30, 50, 75, 100].includes(w) ? ` style="width:${w}%"` : ''}/>`
}
// links go nowhere offline: keep the text, drop the href
md.renderer.rules.link_open = (tokens, i, opts, _env, self) => { tokens[i].attrs = []; return self.renderToken(tokens, i, opts) }

const esc = md.utils.escapeHtml
const page = (title: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="th" xml:lang="th">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${body}</body>
</html>`

const CSS = 'body{line-height:1.8;margin:0 .5em}h1{font-size:1.4em;margin:1em 0}p{margin:0 0 1em;text-indent:1em}img{max-width:100%;height:auto}figure{margin:1em 0;text-align:center}figcaption{font-size:.85em;opacity:.7}'

type Story = { id: number; title: string; synopsis: string; genre: string; coverImage: string }
type Chapter = { no: number; title: string; content: string }

/** The model usually repeats the chapter title as the first line; the page heading already shows it. */
function render(c: Chapter, images: Set<string>) {
  const lines = c.content.split('\n')
  const first = lines.findIndex(l => l.trim() !== '')
  if (first !== -1 && c.title && lines[first].replace(/^#+\s*/, '').trim() === c.title.trim()) lines.splice(first, 1)
  return md.render(lines.join('\n'), { images })
}

/** One EPUB 3 file: an intro page, a page per chapter, the nav, and the images the chapters (and cover) use. */
export async function buildEpub(story: Story, chapters: Chapter[]) {
  const images = new Set<string>()
  const pages = [
    { id: 'intro', file: 'intro.xhtml', title: story.title, html: page(story.title, `<h1>${esc(story.title)}</h1>${story.genre ? `<p>${esc(story.genre)}</p>` : ''}${story.synopsis ? md.render(story.synopsis, { images }) : ''}`) },
    ...chapters.map(c => {
      const title = c.title || `ตอนที่ ${c.no}`
      return { id: `ch${c.no}`, file: `ch${c.no}.xhtml`, title, html: page(title, `<h1>${esc(title)}</h1>${render(c, images)}`) }
    }),
  ]
  const cover = story.coverImage && onDisk(story.coverImage) ? story.coverImage : ''
  if (cover) images.add(cover)
  const names = [...images]

  const item = (id: string, href: string, type: string, props = '') => `<item id="${id}" href="${href}" media-type="${type}"${props}/>`
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:ai-novel:story-${story.id}</dc:identifier>
<dc:title>${esc(story.title)}</dc:title>
<dc:language>th</dc:language>
${story.synopsis ? `<dc:description>${esc(story.synopsis)}</dc:description>\n` : ''}${cover ? '<meta name="cover" content="img-cover"/>\n' : ''}<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
</metadata>
<manifest>
${item('nav', 'nav.xhtml', 'application/xhtml+xml', ' properties="nav"')}
${item('css', 'style.css', 'text/css')}
${pages.map(p => item(p.id, p.file, 'application/xhtml+xml')).join('\n')}
${names.map((n, i) => item(n === cover ? 'img-cover' : `img${i}`, `images/${n}`, MEDIA[n.split('.').pop()!], n === cover ? ' properties="cover-image"' : '')).join('\n')}
</manifest>
<spine>
${pages.map(p => `<itemref idref="${p.id}"/>`).join('\n')}
</spine>
</package>`
  const nav = page(story.title, `<nav epub:type="toc"><h1>สารบัญ</h1><ol>${pages.map(p => `<li><a href="${p.file}">${esc(p.title)}</a></li>`).join('')}</ol></nav>`)

  return zip([
    { name: 'mimetype', data: 'application/epub+zip', store: true }, // must be first and uncompressed
    { name: 'META-INF/container.xml', data: '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' },
    { name: 'OEBPS/content.opf', data: opf },
    { name: 'OEBPS/nav.xhtml', data: nav },
    { name: 'OEBPS/style.css', data: CSS },
    ...pages.map(p => ({ name: `OEBPS/${p.file}`, data: p.html })),
    ...await Promise.all(names.map(async n => ({ name: `OEBPS/images/${n}`, data: new Uint8Array(await Bun.file(join(UPLOAD_DIR, n)).arrayBuffer()), store: true }))),
  ])
}
