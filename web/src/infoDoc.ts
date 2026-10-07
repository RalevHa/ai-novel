import MarkdownIt from 'markdown-it'

// The info pages (terms, guide, ...) are Markdown written by an admin. No raw HTML and no images, so a page cannot pull in anything external;
// links are plain, and emails written in the text become mailto links.
const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false }).disable('image')

export const renderDoc = (text: string) => md.render(text)

/** What the server fills in on the public page, for the admin's preview. */
export const previewPlaceholders = (text: string, s: { operator: string; contactEmail: string }) =>
  text.split('{{operator}}').join(s.operator).split('{{contactEmail}}').join(s.contactEmail || '(ยังไม่ได้ตั้งค่าอีเมลติดต่อ)')
