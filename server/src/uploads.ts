import { mkdirSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'

export const UPLOAD_DIR = process.env.UPLOAD_DIR || join(import.meta.dir, '..', 'uploads')
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024
mkdirSync(UPLOAD_DIR, { recursive: true })

const EXT = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as const
export const MIME_BY_EXT: Record<string, string> = { ...EXT, jpeg: 'image/jpeg' }
export const NAME_RE = /^[0-9a-f-]{36}\.(png|jpg|webp)$/ // what we generate; also what we are willing to serve

/** Identify an image by its first bytes: the client-declared type and file name are not trusted. SVG is deliberately unsupported. */
export function sniffImage(b: Uint8Array): keyof typeof EXT | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'webp'
  return null
}

/** Validate and store; returns the stored file name. Throws a Thai message the UI can show. */
export async function saveImage(file: File) {
  if (file.size > MAX_IMAGE_BYTES) throw new Error('ไฟล์ใหญ่เกิน 3 MB')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const ext = sniffImage(bytes)
  if (!ext) throw new Error('รองรับเฉพาะไฟล์รูป PNG, JPEG หรือ WebP')
  const name = `${crypto.randomUUID()}.${ext}`
  await Bun.write(join(UPLOAD_DIR, name), bytes)
  return name
}

/** Best-effort delete of a stored file (safe against odd names; ignores missing files). */
export async function removeUpload(name: string) {
  if (!NAME_RE.test(name)) return
  await unlink(join(UPLOAD_DIR, name)).catch(() => {})
}
