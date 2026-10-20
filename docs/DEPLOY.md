# นำเว็บขึ้นใช้งานจริงบนเครื่องที่บ้าน (Cloudflare Tunnel)

เป้าหมาย: เครื่องที่บ้านรันเว็บ ฐานข้อมูลและเซิร์ฟเวอร์ไม่เปิดพอร์ตสู่อินเทอร์เน็ต ผู้ใช้เข้าผ่านโดเมนที่อยู่หลัง Cloudflare ชื่อคำสั่งของ `cloudflared` และชื่อเมนูใน dashboard ของ Cloudflare อาจเปลี่ยนตามเวอร์ชัน ให้เทียบกับเอกสารของ Cloudflare ตอนทำ ส่วนรายละเอียดฝั่งแอป (ตัวแปร env, rate limit) ดู [SERVER.md](SERVER.md)

```
ผู้ใช้ ─HTTPS─▶ Cloudflare ─ท่อ─▶ cloudflared ─▶ Caddy :8080 ─┬─ /api/*  → bun :3000 ─▶ Postgres :5433 (เฉพาะ localhost)
                                                              └─ อื่น ๆ   → web/dist (ไฟล์เว็บ)
```

ทุกอย่างหลัง `cloudflared` คุยกันบน `localhost` เท่านั้น ไม่มีพอร์ตไหนต้องเปิดที่เราเตอร์

## 1. เตรียมเครื่อง
- ติดตั้ง Docker, Bun, Caddy และ `cloudflared`
- **เครื่องต้องไม่หลับและเปิดอัตโนมัติหลังไฟดับ** (macOS: ปิด sleep ในการตั้งค่าพลังงาน หรือรัน `caffeinate -s`; Linux: ปกติไม่มีปัญหา) ถ้าเครื่องหลับ เว็บก็ล่ม
- ถ้าเป็นไปได้ใช้ UPS และสายแลน

## 2. ฐานข้อมูล
- `docker-compose.yml` ผูกพอร์ต Postgres ไว้ที่ `127.0.0.1:5433` แล้ว (เข้าได้จากเครื่องนี้เท่านั้น) และมี `restart: unless-stopped`
- **เปลี่ยนรหัสผ่านก่อนใช้จริง** (ค่าตั้งต้น `novel/novel`): แก้ `POSTGRES_PASSWORD` ใน compose และ `DATABASE_URL` ใน `server/.env` ให้ตรงกัน
- `docker compose up -d` แล้ว `cd server && bun run db:migrate`

## 3. ตั้งค่าเซิร์ฟเวอร์ (`server/.env`)
ในโหมด production เซิร์ฟเวอร์จะไม่ยอมบูตถ้าค่าเหล่านี้ไม่ถูกต้อง:

| ตัวแปร | ค่าที่ควรตั้ง |
|---|---|
| `NODE_ENV` | `production` (cookie จะเป็น `secure`) |
| `JWT_SECRET` | สุ่มยาว ≥32 ตัว เช่น `openssl rand -base64 48` |
| `KEY_ENCRYPTION_SECRET` | สุ่มอีกค่า แยกจาก `JWT_SECRET` และ**ห้ามเปลี่ยนภายหลัง** ไม่งั้นคีย์ AI ที่เก็บไว้อ่านไม่ได้ |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | บัญชีแอดมินแรก (ห้ามใช้ `admin1234`) |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | บริการส่งอีเมลสำหรับรหัสยืนยัน **ไม่ควรส่งตรงจากเครื่องที่บ้าน** (IP บ้านมักถูกตีเป็นสแปม) ใช้บริการส่งอีเมล เช่น Resend, Brevo, SES หรือ Gmail แบบ app password |
| `PUBLIC_URL` | `https://novel.yourdomain.com` (ใช้ใน RSS และการ์ดแชร์) |
| `TRUST_CLOUDFLARE` | `true` เฉพาะเมื่อเซิร์ฟเวอร์เข้าถึงได้ผ่านท่อเท่านั้น (ดูข้อ 6) |
| `UPLOAD_DIR` | โฟลเดอร์ถาวรที่สำรองข้อมูลได้ (รูปปกและรูปตอน) |

`CORS_ORIGIN` ไม่ต้องตั้ง เพราะหน้าเว็บกับ API ใช้โดเมนเดียวกัน

เริ่มเซิร์ฟเวอร์ด้วย `bun src/index.ts` (ไม่ใช่ `--watch`) และให้รันเป็น service ที่เริ่มเองตอนเปิดเครื่องและรีสตาร์ตเมื่อล้ม (macOS: launchd, Linux: systemd)

## 4. ไฟล์หน้าเว็บ + ตัวกระจายเส้นทาง (Caddy)
```bash
cd web && bun run build   # ได้โฟลเดอร์ web/dist
```
`Caddyfile` (แก้พาธให้ตรงเครื่อง):
```
:8080 {
  encode gzip
  handle /api/* {
    reverse_proxy localhost:3000 {
      flush_interval -1      # ให้ข้อความที่ AI เขียนไหลมาทีละส่วน ไม่ถูกพักบัฟเฟอร์
    }
  }
  handle {
    root * /path/to/ai-novel/web/dist
    try_files {path} /index.html   # เส้นทางของ SPA เช่น /story/1 ต้องได้หน้าเดียวกัน
    file_server
  }
}
```
Caddy ฟังที่ `:8080` บนเครื่องนี้ ไม่เปิดสู่ภายนอก (ถ้าเครื่องมีไฟร์วอลล์ ก็ไม่ต้องเปิดพอร์ตนี้)

## 5. ท่อ Cloudflare
1. `cloudflared tunnel login` (เลือกโดเมนของคุณ)
2. `cloudflared tunnel create ai-novel` (ได้ UUID และไฟล์ credentials)
3. ไฟล์ `config.yml`:
   ```yaml
   tunnel: <UUID>
   credentials-file: /path/to/<UUID>.json
   ingress:
     - hostname: novel.yourdomain.com
       service: http://localhost:8080
     - service: http_status:404
   ```
4. `cloudflared tunnel route dns ai-novel novel.yourdomain.com`
5. ติดตั้งเป็น service (`cloudflared service install`) ให้เริ่มเองตอนเปิดเครื่อง

## 6. ความปลอดภัยของ IP ผู้ใช้
แอปใช้ IP ผู้ใช้จำกัดอัตรา (สมัคร ขอรหัส ล็อกอิน) ผ่านท่อ แอปจะเห็นทุกคำขอมาจาก `127.0.0.1` ถ้าไม่ตั้ง `TRUST_CLOUDFLARE` ทุกคนจะถูกนับเป็น IP เดียวกัน (เพดานรวมทั้งเว็บ) ตั้ง `TRUST_CLOUDFLARE=true` แล้วแอปจะอ่าน IP จริงจาก `CF-Connecting-IP` ซึ่ง**เชื่อได้ก็ต่อเมื่อไม่มีทางอื่นเข้าถึงเซิร์ฟเวอร์** ตรวจให้แน่ว่า:
- ไม่มี port forward ที่เราเตอร์ไปยัง 3000 หรือ 8080
- Caddy และ bun ฟังบน `localhost` เท่านั้น
- เครื่องอื่นในบ้านที่ไม่ไว้ใจไม่ควรเข้า 3000/8080 ได้ (หรือยอมรับความเสี่ยงนั้น)

## 7. Cloudflare dashboard
- เปิด "Always use HTTPS"
- เพิ่ม Rate limiting rule ที่เส้นทาง `/api/auth/` เป็นชั้นนอก (จำนวนกฎที่ใช้ได้ฟรีขึ้นกับแพลน ตรวจใน dashboard) ชั้นในของแอปยังจำกัดรายอีเมลและรายผู้ใช้อยู่
- ข้อจำกัด: ตามที่ทราบ Cloudflare ตัดคำขอที่ต้นทางไม่ตอบภายในราว 100 วินาที (ตรวจกับเอกสารปัจจุบัน) การเขียนตอนแบบสตรีมไม่กระทบ แต่การสรุปตอน ตรวจความต่อเนื่อง และเสนอตัวละครที่ใช้โมเดลช้าอาจโดนตัด
- การ์ดแชร์ลิงก์ (`/api/og/...`) ต้องจัดให้บอตของ LINE/Facebook ไปที่เส้นทางนั้น ยังไม่ได้ตั้งไว้ในเอกสารนี้

## 8. สำรองข้อมูล (เครื่องที่บ้านต้องทำเอง)
- ฐานข้อมูล: `docker compose exec -T db pg_dump -U novel novel > backup-$(date +%F).sql` ตั้งให้รันทุกคืนด้วย cron/launchd และเก็บสำเนาไว้**นอกเครื่องนี้** (ดิสก์ภายนอกหรือคลาวด์)
- โฟลเดอร์ `UPLOAD_DIR` และไฟล์ `server/.env` (โดยเฉพาะ `KEY_ENCRYPTION_SECRET`)
- ลองกู้คืนบนเครื่องอื่นสักครั้ง ก่อนพึ่งพามันจริง

## 9. ตรวจหลังตั้งค่า
1. เปิด `https://novel.yourdomain.com` จากเครือข่ายอื่น (เช่น เน็ตมือถือ)
2. สมัครด้วยอีเมลจริงและได้รับรหัส
3. ล็อกอินผิดซ้ำ ๆ จนขึ้น "ลองเข้าสู่ระบบบ่อยเกินไป" ด้วยเครื่องหนึ่ง แล้วดูว่าอีกเครื่อง/เครือข่ายหนึ่งยังล็อกอินได้ตามปกติ (ยืนยันว่าอ่าน IP จริงถูก ไม่ใช่นับรวม)
4. ลอง `curl -H 'CF-Connecting-IP: 1.2.3.4' http://localhost:3000/api/health` ได้ปกติ และลองเข้า `http://<IP ของเครื่อง>:3000` จากเครื่องอื่นในบ้านว่าเข้าไม่ได้ตามที่ต้องการ
