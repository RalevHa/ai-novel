import { expect, test } from 'bun:test'
import { ogPage } from '../src/og'

test('ogPage: escapes every field, cleans the description, falls back to a small card without an image', () => {
  const html = ogPage({ title: 'a "b" <c>', description: '# หัวข้อ\n\nข้อความ   <script>', url: 'https://x.example/story/1?a=1&b=2' })
  expect(html).toContain('<meta property="og:title" content="a &quot;b&quot; &lt;c&gt;">')
  expect(html).toContain('content="หัวข้อ ข้อความ &lt;script&gt;"')
  expect(html).toContain('content="https://x.example/story/1?a=1&amp;b=2"')
  expect(html).toContain('twitter:card" content="summary"')
  expect(html).not.toContain('og:image')
  expect(ogPage({ title: 't', description: 'd', url: 'https://x/', image: 'https://x/i.png' })).toContain('summary_large_image')
})
