import { expect, test } from 'bun:test'
import { otpMail } from '../src/mail'

test('otpMail: the code, expiry and a subject per purpose are in both the HTML and the text body', () => {
  for (const p of ['verify', 'reset', 'change', 'delete'] as const) {
    const m = otpMail(p, '048213')
    expect(m.html).toContain('048213') // a leading zero must survive
    expect(m.text).toContain('048213')
    expect(m.text).toContain('10 นาที')
    expect(m.subject).toEndWith('— AI Novel')
  }
  expect(otpMail('verify', '1').subject).not.toBe(otpMail('reset', '1').subject)
})

test('otpMail: the display name is HTML-escaped, and the site look (paper blue, 物語, dark mode) is there', () => {
  const m = otpMail('verify', '123456', '<img src=x onerror=alert(1)>')
  expect(m.html).not.toContain('<img')
  expect(m.html).toContain('&lt;img')
  expect(m.html).toContain('#274472')
  expect(m.html).toContain('物語')
  expect(m.html).toContain('prefers-color-scheme: dark')
})
