import nodemailer from 'nodemailer'
import { esc } from './xml'

export type Purpose = 'verify' | 'reset' | 'change' | 'delete'
export const OTP_MINUTES = 10

const COPY: Record<Purpose, { subject: string; heading: string; intro: string }> = {
  verify: { subject: 'ยืนยันอีเมลของคุณ', heading: 'ยืนยันอีเมลของคุณ', intro: 'ขอบคุณที่สมัครสมาชิก ใช้รหัสด้านล่างเพื่อยืนยันอีเมล แล้วเริ่มอ่านนิยายได้เลย' },
  reset: { subject: 'รหัสสำหรับตั้งรหัสผ่านใหม่', heading: 'ตั้งรหัสผ่านใหม่', intro: 'มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้ ใช้รหัสด้านล่างเพื่อดำเนินการต่อ' },
  delete: { subject: 'ยืนยันการลบบัญชี', heading: 'ยืนยันการลบบัญชี', intro: 'มีคำขอลบบัญชีนี้อย่างถาวร ถ้าใช้รหัสด้านล่าง ข้อมูลของคุณจะถูกลบและกู้คืนไม่ได้ ถ้าไม่ใช่คุณ ห้ามบอกรหัสกับใคร และควรเปลี่ยนรหัสผ่านทันที' },
  change: { subject: 'ยืนยันอีเมลใหม่ของคุณ', heading: 'ยืนยันอีเมลใหม่', intro: 'มีคำขอเปลี่ยนอีเมลของบัญชีมาเป็นที่อยู่นี้ ใช้รหัสด้านล่างเพื่อยืนยันว่าเป็นของคุณ' },
}

// Colours are the site's "paper" theme (and "ink" for dark mode); mail clients ignore web fonts and CSS variables, so everything is inline.
const SERIF = `'Noto Serif Thai','Shippori Mincho',Georgia,'Times New Roman',serif`
const SANS = `'IBM Plex Sans Thai',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`

/** Subject, HTML and plain-text body for a one-time code, in the look of the site. */
export function otpMail(purpose: Purpose, code: string, name = '') {
  const c = COPY[purpose], hello = name ? `สวัสดีคุณ ${esc(name)}` : 'สวัสดี'
  const subject = `${c.subject} — AI Novel`
  const text = `${hello}\n\n${c.intro}\n\nรหัสของคุณ: ${code}\n\nรหัสใช้ได้ ${OTP_MINUTES} นาที และใช้ได้ครั้งเดียว ห้ามบอกรหัสนี้กับใคร\nถ้าคุณไม่ได้เป็นคนทำรายการนี้ ไม่ต้องทำอะไร ปล่อยอีเมลนี้ไว้ได้เลย\n\nAI Novel`
  const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(subject)}</title>
<style>
@media (prefers-color-scheme: dark){
  .page{background:#0f1624 !important}.card{background:#172034 !important;border-color:#2a3650 !important}
  .fg{color:#e7e9ee !important}.muted{color:#a9b0c0 !important}.codebox{background:#0f1624 !important;border-color:#2a3650 !important}.code{color:#8fb0e8 !important}
}
</style></head>
<body style="margin:0;padding:0;background:#f3f4f1" class="page">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="page" style="background:#f3f4f1"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="max-width:480px;background:#ffffff;border:1px solid #dddfda;border-radius:16px;overflow:hidden">
    <tr><td bgcolor="#274472" style="background:#274472;background-image:linear-gradient(135deg,#1f3a66,#4c7db8);padding:22px 28px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:${SERIF};font-size:30px;line-height:1;color:#ffffff;letter-spacing:.12em;padding-right:14px">物語</td>
        <td style="font-family:${SERIF};font-size:18px;font-weight:700;color:#ffffff">AI Novel</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:28px 28px 8px;font-family:${SANS};color:#1e2128" class="fg">
      <h1 style="margin:0 0 10px;font-family:${SERIF};font-size:24px;line-height:1.35;color:#1e2128" class="fg">${esc(c.heading)}</h1>
      <p style="margin:0 0 4px;font-size:15px;line-height:1.7" class="fg">${hello}</p>
      <p style="margin:0;font-size:15px;line-height:1.7" class="fg">${esc(c.intro)}</p>
    </td></tr>
    <tr><td align="center" style="padding:18px 28px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="codebox" style="background:#f3f4f1;border:1px solid #dddfda;border-radius:12px"><tr><td align="center" style="padding:18px 8px">
        <div class="code" style="font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:36px;font-weight:700;letter-spacing:.35em;padding-left:.35em;color:#274472">${code}</div>
      </td></tr></table>
    </td></tr>
    <tr><td style="padding:0 28px 26px;font-family:${SANS};font-size:13px;line-height:1.7;color:#5b6070" class="muted">
      <p style="margin:0 0 6px">รหัสใช้ได้ <strong>${OTP_MINUTES} นาที</strong> และใช้ได้ครั้งเดียว ห้ามบอกรหัสนี้กับใคร ทีมงานจะไม่ขอรหัสจากคุณ</p>
      <p style="margin:0">ถ้าคุณไม่ได้เป็นคนทำรายการนี้ ไม่ต้องทำอะไร ปล่อยอีเมลนี้ไว้ได้เลย</p>
    </td></tr>
    <tr><td style="border-top:3px solid #5e9c92;padding:14px 28px;font-family:${SANS};font-size:12px;color:#8a8f9c" class="muted">อีเมลนี้ส่งอัตโนมัติ ไม่ต้องตอบกลับ</td></tr>
  </table>
</td></tr></table>
</body></html>`
  return { subject, html, text }
}

const port = Number(process.env.SMTP_PORT) || 587
const transport = () => nodemailer.createTransport({
  host: process.env.SMTP_HOST, port, secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
})

/** Sends through SMTP_*; without SMTP_HOST (local dev only, production refuses to boot) the mail is printed to the console instead. */
export async function sendMail(to: string, m: { subject: string; html: string; text: string }) {
  if (!process.env.SMTP_HOST) { console.log(`[mail:dev] to ${to}\n${m.subject}\n${m.text}`); return }
  await transport().sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, ...m })
}
