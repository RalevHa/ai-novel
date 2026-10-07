export const NO_EMAIL = '(ยังไม่ได้ตั้งค่าอีเมลติดต่อ)'

/** Fills {{operator}} and {{contactEmail}} in an info page. split/join, so `$` in a name is not read as a replacement pattern. */
export function fillPlaceholders(body: string, s: { operator: string; contactEmail: string }) {
  return body.split('{{operator}}').join(s.operator).split('{{contactEmail}}').join(s.contactEmail || NO_EMAIL)
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
