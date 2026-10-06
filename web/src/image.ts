const MAX_BYTES = 3 * 1024 * 1024 // same limit the server enforces

/** Shrink and re-encode in the browser before upload: small files, and EXIF/GPS metadata is dropped. */
export async function prepareImage(file: File, maxSide: number): Promise<File> {
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) throw new Error('เลือกไฟล์รูป PNG, JPEG หรือ WebP')
  let bmp: ImageBitmap
  try { bmp = await createImageBitmap(file) } catch { throw new Error('เปิดไฟล์รูปนี้ไม่ได้') }
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bmp.width * k)); canvas.height = Math.max(1, Math.round(bmp.height * k))
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/webp', 0.85))
  if (!blob) throw new Error('แปลงรูปไม่สำเร็จ')
  if (blob.size > MAX_BYTES) throw new Error('ไฟล์ใหญ่เกิน 3 MB แม้ย่อแล้ว')
  return new File([blob], 'image.' + (blob.type === 'image/png' ? 'png' : 'webp'), { type: blob.type })
}

export const imageUrl = (name?: string) => name ? `/api/uploads/${name}` : ''
