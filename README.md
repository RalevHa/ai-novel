# AI Novel

เว็บอ่านนิยายที่ให้ AI แต่ง (ผ่าน [OpenRouter](https://openrouter.ai)) ไว้อ่านส่วนตัว มีทั้งหน้าอ่านสำหรับผู้อ่านและหลังบ้านสำหรับผู้ดูแล

**สำหรับผู้อ่าน:** ชั้นหนังสือ ปกเรื่อง (อัปโหลดเองหรือสร้างอัตโนมัติ) สารบัญ ตัวละครของเรื่อง หน้าอ่านที่ปรับธีม/ฟอนต์/ขนาดตัวอักษรได้ เลือกตอนได้จากในหน้าอ่าน

**สำหรับผู้ดูแล (admin):** สร้างเรื่อง ให้ AI เขียนตอนใหม่แบบเห็นข้อความไหลสด ตัวแก้ไขตอนแบบ WYSIWYG (แทรกรูป ปรับขนาด/จัดวาง/คำบรรยาย) สรุปตอนอัตโนมัติ จัดการตัวละคร (ให้ AI เสนอจากเรื่องได้) เผยแพร่/ซ่อนตอน จัดการผู้ใช้

## โครงสร้าง

```
server/   Elysia (Bun) + Drizzle + PostgreSQL   พอร์ต 3000
web/      Vue 3 + Vite + Tailwind CSS           พอร์ต 5173 (proxy /api ไป server)
```

โปรเจกต์เป็น Bun workspace (`package.json` ที่ราก) หน้าเว็บ import ชนิดข้อมูลของ API จาก `server/src` โดยตรง (Eden Treaty) จึงต้องอยู่ repo เดียวกัน

## เริ่มใช้งาน

ต้องมี [Bun](https://bun.sh) และ Docker

```bash
# 1) ฐานข้อมูล
docker compose up -d

# 2) ติดตั้ง dependency (รันที่โฟลเดอร์รากเท่านั้น)
bun install

# 3) ตั้งค่า
cp server/.env.example server/.env
#    แก้ server/.env: ใส่ OPENROUTER_API_KEY, เปลี่ยน JWT_SECRET และ ADMIN_PASSWORD

# 4) สร้างตารางในฐานข้อมูล
cd server && bun run db:push

# 5) รัน (เปิดสองเทอร์มินัล)
cd server && bun run dev      # API
cd web && bun run dev         # หน้าเว็บ → http://localhost:5173
```

เข้าสู่ระบบ admin ด้วย `ADMIN_EMAIL` / `ADMIN_PASSWORD` ใน `server/.env` (ระบบสร้างบัญชีนี้ให้ตอนเริ่มครั้งแรกถ้ายังไม่มี) ผู้อ่านสมัครสมาชิกเองได้จากหน้าเว็บ

## ตัวแปรใน `server/.env`

| ตัวแปร | ความหมาย |
|---|---|
| `DATABASE_URL` | ที่อยู่ PostgreSQL (ค่าในตัวอย่างตรงกับ `docker-compose.yml`) |
| `OPENROUTER_API_KEY` | key จาก OpenRouter (โมเดลที่ไม่ใช่ `:free` ต้องเติมเครดิตก่อน) |
| `DEFAULT_MODEL` | โมเดลเริ่มต้น เปลี่ยนรายเรื่องได้ในหน้าตั้งค่าเรื่อง |
| `JWT_SECRET` | ความลับสำหรับ session ใช้ค่าสุ่มยาวๆ เช่น `openssl rand -hex 32` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | บัญชี admin ตั้งต้น **ต้องเปลี่ยนก่อนใช้งานจริง** |
| `MAX_OUTPUT_TOKENS` | เพดานความยาวที่ AI เขียนต่อหนึ่งตอน (กันโมเดลที่วนซ้ำกินเงิน) |
| `UPLOAD_DIR` | ที่เก็บรูปที่อัปโหลด เว้นว่าง = `server/uploads` |
| `NODE_ENV` | ตั้งเป็น `production` ตอน deploy: cookie เป็น `secure`, CORS ปิด (same-origin) และ server ไม่ยอมเริ่มถ้า `JWT_SECRET` สั้นกว่า 32 ตัวอักษร / ยังเป็น `change-me` หรือ `ADMIN_PASSWORD` ยังเป็นค่าตัวอย่าง |
| `CORS_ORIGIN` | origin ของหน้าเว็บ (คั่นด้วย `,`) ใช้เฉพาะเมื่อหน้าเว็บกับ API อยู่คนละโดเมน |
| `ALLOW_REGISTRATION` | `false` = ปิดรับสมัครสมาชิก (ค่าเริ่มต้นเปิด) |

## ข้อควรรู้

- **รูปที่อัปโหลด** อยู่ในโฟลเดอร์ `server/uploads` (ไม่อยู่ใน git) ถ้า deploy ต้องผูก volume ถาวรไว้ ไม่งั้นรูปหายเมื่อสร้างเครื่องใหม่
- **ค่าใช้จ่าย** คิดตามที่ OpenRouter เรียกเก็บ ประมาณ 0.4-6 บาทต่อตอน ขึ้นกับโมเดล (ตอนยาว 2,000-3,000 คำ)
- **คุณภาพภาษาไทย** ของโมเดลฟรีบางตัวต่ำ (สระหาย วนซ้ำ) แนะนำโมเดลที่เก่งไทยสำหรับเรื่องจริง
- ถ้าติดตั้งแพ็กเกจใหม่แล้ว build ล้มด้วย `The service was stopped` บน macOS ให้ลบแล้วคัดลอกไฟล์ `node_modules/@esbuild/darwin-arm64/bin/esbuild` ใหม่ (ระบบฆ่าไบนารีที่ถูก hardlink)

## คำสั่งที่ใช้บ่อย

```bash
cd web && bunx vue-tsc --noEmit -p tsconfig.app.json   # ตรวจชนิดข้อมูลหน้าเว็บ (รวมชนิดของ API)
cd server && bunx tsc --noEmit                         # ตรวจชนิดข้อมูล server
cd web && bunx vite build                              # build หน้าเว็บ
```
