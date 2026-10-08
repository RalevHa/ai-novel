import { esc } from './xml'

type Card = { title: string; description: string; image?: string; url: string; siteName?: string }

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
