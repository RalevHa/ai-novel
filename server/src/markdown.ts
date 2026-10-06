// Chapters are stored as Markdown: one blank line between paragraphs, images as ![alt](/api/uploads/<name>).
const UPLOAD_REF = /\/api\/uploads\/([0-9a-f-]{36}\.(?:png|jpg|webp))/g

/** AI output and legacy chapters use one line per paragraph; Markdown needs a blank line between paragraphs. */
export const normalizeParagraphs = (text: string) =>
  text.replace(/\r\n?/g, '\n').split('\n').map(l => l.trimEnd()).filter(l => l.trim() !== '').join('\n\n')

/** Names of uploaded files a chapter refers to. */
export const imageNames = (md: string) => [...new Set([...md.matchAll(UPLOAD_REF)].map(m => m[1]))]

/** Images mean nothing to the writing model: drop them before the text is used as context or summarised. */
export const stripImages = (md: string) => md.replace(/!\[[^\]]*\]\((?:[^)"]|"[^"]*")*\)/g, '').replace(/\n{3,}/g, '\n\n').trim()
