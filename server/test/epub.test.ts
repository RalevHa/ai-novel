import { afterAll, expect, test } from 'bun:test'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { buildEpub, zip } from '../src/epub'
import { removeUpload, UPLOAD_DIR } from '../src/uploads'

/** Reads a ZIP back through its central directory, verifying every CRC. */
function unzip(z: Buffer) {
  const end = z.length - 22
  expect(z.readUInt32LE(end)).toBe(0x06054b50)
  const out = new Map<string, { data: Buffer; method: number }>()
  let p = z.readUInt32LE(end + 16)
  for (let i = 0, n = z.readUInt16LE(end + 10); i < n; i++) {
    const method = z.readUInt16LE(p + 10), crc = z.readUInt32LE(p + 16), csize = z.readUInt32LE(p + 20)
    const nameLen = z.readUInt16LE(p + 28), off = z.readUInt32LE(p + 42)
    const name = z.toString('utf8', p + 46, p + 46 + nameLen)
    const start = off + 30 + z.readUInt16LE(off + 26) + z.readUInt16LE(off + 28)
    const raw = z.subarray(start, start + csize)
    const data = method === 8 ? inflateRawSync(raw) : raw
    expect(Bun.hash.crc32(data)).toBe(crc)
    out.set(name, { data, method })
    p += 46 + nameLen
  }
  return out
}

test('zip: round-trips text and binary, keeps order and stored entries', () => {
  const bin = new Uint8Array([0, 255, 1, 254])
  const files = unzip(zip([{ name: 'mimetype', data: 'application/epub+zip', store: true }, { name: 'a/ไทย.txt', data: 'สวัสดี'.repeat(50) }, { name: 'b.bin', data: bin, store: true }]))
  expect([...files.keys()]).toEqual(['mimetype', 'a/ไทย.txt', 'b.bin'])
  expect(files.get('mimetype')).toMatchObject({ method: 0 })
  expect(files.get('a/ไทย.txt')!.method).toBe(8)
  expect(files.get('a/ไทย.txt')!.data.toString()).toBe('สวัสดี'.repeat(50))
  expect([...files.get('b.bin')!.data]).toEqual([...bin])
})

const img = `${crypto.randomUUID()}.png`, cover = `${crypto.randomUUID()}.png`, gone = `${crypto.randomUUID()}.png`
await Bun.write(join(UPLOAD_DIR, img), new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0]))
await Bun.write(join(UPLOAD_DIR, cover), new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0]))
afterAll(() => Promise.all([removeUpload(img), removeUpload(cover)]))

test('buildEpub: package layout, escaping, title de-duplication, image handling', async () => {
  const files = unzip(await buildEpub(
    { id: 7, title: 'ชื่อ <เรื่อง> & "ทดสอบ"', synopsis: 'เรื่องย่อ', genre: 'แฟนตาซี', coverImage: cover },
    [
      { no: 1, title: 'ตอนแรก', content: `# ตอนแรก\n\nย่อหน้าแรก **หนา**\n\n![รูป](/api/uploads/${img}#w=50 "คำบรรยาย")\n\n![หาย](/api/uploads/${gone})\n\n![นอก](https://evil.example/x.png)\n\n<script>alert(1)</script>` },
      { no: 3, title: '', content: 'ตอนที่สาม' },
    ],
  ))
  expect([...files.keys()][0]).toBe('mimetype') // first and stored, or readers reject the file
  expect(files.get('mimetype')!.method).toBe(0)
  const text = (n: string) => files.get(n)!.data.toString()

  const opf = text('OEBPS/content.opf')
  expect(opf).toContain('<dc:title>ชื่อ &lt;เรื่อง&gt; &amp; &quot;ทดสอบ&quot;</dc:title>')
  expect(opf).toContain('properties="cover-image"')
  expect(opf.match(/<itemref /g)).toHaveLength(3) // intro + 2 chapters (draft gaps like a missing no 2 are fine)
  expect(files.has(`OEBPS/images/${img}`)).toBe(true)
  expect(files.has(`OEBPS/images/${cover}`)).toBe(true)
  expect(files.has(`OEBPS/images/${gone}`)).toBe(false)

  const ch1 = text('OEBPS/ch1.xhtml')
  expect(ch1).toContain(`<img src="images/${img}" alt="รูป" style="width:50%"/>`)
  expect(ch1).not.toContain('evil.example')
  expect(ch1).not.toContain(gone)
  expect(ch1).not.toContain('<script>')
  expect(ch1.match(/ตอนแรก/g)).toHaveLength(2) // <title> and <h1>, not repeated from the body
  expect(text('OEBPS/ch3.xhtml')).toContain('<h1>ตอนที่ 3</h1>') // untitled chapter falls back to its number
  expect(text('OEBPS/nav.xhtml')).toContain('href="ch3.xhtml"')
})
