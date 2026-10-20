# ระบบฝั่งเซิร์ฟเวอร์ (server)

โค้ดอยู่ที่ `server/src/` (Bun + Elysia + Drizzle ORM + PostgreSQL) ทุก API อยู่ใต้ `/api` หน้าเว็บเรียกผ่าน Eden Treaty โดยนำเข้าชนิดข้อมูลจาก `server/src/index.ts` ตรง ๆ (`export type App`) การเปลี่ยนรูปแบบ route หรือผลลัพธ์จึงมีผลกับ type ของเว็บทันที ภาพฝั่งหน้าเว็บอยู่ที่ [PAGES.md](PAGES.md) สรุปฟีเจอร์ที่ [FEATURES.md](FEATURES.md)

## 1. การทำงานโดยรวม

```
เบราว์เซอร์ ──(cookie JWT)──▶ Elysia /api ──▶ PostgreSQL (drizzle)
                               │  ├─ ไฟล์รูป  UPLOAD_DIR
                               │  ├─ SMTP     ส่งรหัส 6 หลัก (ไม่มี SMTP_HOST = พิมพ์ลง console)
                               │  └─ OpenRouter / โมเดลในเครื่อง (local:)  ใช้คีย์ของผู้เรียกเอง
```

- **ประกอบ route** (`index.ts` ท้ายไฟล์): `cors` → `/health` → `authRoutes` (`/auth`) → `readerRoutes` → `commentRoutes` → `siteRoutes` (`site.ts`) → `meRoutes` (`/me`) → `adminRoutes` (`/admin`)
- **ตอนบูต** (`import.meta.main`): `assertConfig()` ตรวจค่าตั้งต้น → `seedAdmin()` สร้างแอดมินจาก env ถ้ายังไม่มี → `sweepOrphans()` ลบรูปที่ไม่มีใครอ้างถึง ทันที และซ้ำทุก 6 ชั่วโมง → listen (`idleTimeout` 255 วินาที เพราะการเรียก AI แบบไม่สตรีมเงียบนานได้)
- **CORS:** dev เปิดทุก origin, production same-origin เท่านั้น เว้นแต่ตั้ง `CORS_ORIGIN` (คั่นด้วย `,`)
- `unhandledRejection` ที่เป็น `AbortError` (ผู้ใช้ปิดแท็บระหว่างสตรีม) ถูกมองว่าปกติ ไม่ทำให้เซิร์ฟเวอร์ล้ม

## 2. การตั้งค่า (`server/.env`, ตัวอย่างที่ `.env.example`)

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `DATABASE_URL` | Postgres (ตัวอย่าง `postgres://novel:novel@localhost:5433/novel` ตรงกับ `docker-compose.yml`) |
| `JWT_SECRET` | ลงนาม session และ HMAC ของรหัสอีเมล production ต้องยาว ≥32 ตัวและไม่ใช่ `change-me` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | สร้างแอดมินครั้งแรกตอนบูต production ห้ามใช้รหัสตัวอย่าง `admin1234` |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` `SMTP_SECURE` | ส่งรหัสยืนยัน production ต้องมี `SMTP_HOST` ไม่งั้นไม่ยอมบูต; dev ไม่ตั้งจะพิมพ์อีเมลลง console |
| `KEY_ENCRYPTION_SECRET` | เข้ารหัสคีย์ OpenRouter ของผู้ใช้ (ไม่ตั้งจะใช้ `JWT_SECRET`) เปลี่ยนแล้วคีย์เก่าอ่านไม่ได้ ทุกคนต้องกรอกใหม่ |
| `DEFAULT_MODEL` | โมเดลเริ่มต้นเมื่อเรื่องไม่ได้ระบุ (`anthropic/claude-sonnet-4.5`) |
| `MAX_OUTPUT_TOKENS` | เพดาน token ต่อการเรียก (16000) กันโมเดลวนจนเสียเงินไม่หยุด |
| `SUMMARY_MODEL` / `CHECK_MODEL` | โมเดลสำหรับสรุปตอน / ตรวจความต่อเนื่อง **ใช้เฉพาะเมื่อผู้เรียกเป็นแอดมิน** (มักเป็นโมเดลในเครื่อง) |
| `LOCAL_BASE_URL` / `LOCAL_API_KEY` | เซิร์ฟเวอร์โมเดลในเครื่องที่เข้ากับ OpenAI (ค่าเริ่มต้น Ollama `http://localhost:11434/v1`) |
| `OPENROUTER_BASE_URL` | เปลี่ยน root ของ OpenRouter (ใช้ในเทสต์) |
| `UPLOAD_DIR` | โฟลเดอร์รูป (ค่าเริ่มต้น `server/uploads`) |
| `PUBLIC_URL` | origin จริงของเว็บ ใช้สร้างลิงก์ใน RSS และการ์ดแชร์เมื่ออยู่หลัง proxy |
| `CORS_ORIGIN` | origin ที่อนุญาตใน production |
| `TRUST_CLOUDFLARE` | `true` = ใช้ IP จาก header `CF-Connecting-IP` สำหรับ rate limit ตั้งเฉพาะเมื่อเซิร์ฟเวอร์เข้าถึงได้ผ่าน Cloudflare Tunnel เท่านั้น (header ปลอมได้ถ้ามีทางเข้าอื่น) ดู [DEPLOY.md](DEPLOY.md) |
| `ALLOW_REGISTRATION` | `false` = ปิดรับสมัคร |
| `OPERATOR_NAME` / `CONTACT_EMAIL` | ค่าตั้งต้นของ `{{operator}}` / `{{contactEmail}}` ในหน้าข้อมูล จนกว่าแอดมินตั้งในหน้าเว็บ |
| `PORT` | พอร์ต (3000) |

## 3. การยืนยันตัวตนและสิทธิ์ (`auth.ts`)

- **Session:** JWT (`@elysiajs/jwt`) เก็บใน cookie `token` แบบ `httpOnly`, `sameSite=lax`, `secure` ใน production อายุ 30 วัน ไม่ต่ออายุเอง
- **ทุกคำขอ** `derive` ถอดโทเคนแล้ว**อ่านบทบาทจากฐานข้อมูล ไม่ใช่จากโทเคน** ผลคือ `me = { id, role }` หรือ `null` ถ้า: ไม่มีโทเคน/โทเคนเสีย, บัญชีถูกระงับ (`suspendedAt`), ผู้ใช้ถูกลบ, หรือโทเคนออกก่อนเวลาเปลี่ยนรหัสผ่านล่าสุด (`issuedBeforeChange` ใช้วินาทีเต็มเทียบกัน) ดังนั้นลดสิทธิ์/ระงับ/เปลี่ยนรหัสมีผลในคำขอถัดไปทันที
- **Guard** (ใช้เป็น `beforeHandle` ของ Elysia):
  | guard | ผ่านเมื่อ | ไม่ผ่าน |
  |---|---|---|
  | `userOnly` | ล็อกอินแล้ว | 401 |
  | `staffOnly` | `admin` หรือ `writer` และ `ownStory` | 401/403 |
  | `adminOnly` | `admin` | 401/403 |
- **`ownStory`:** นักเขียนเข้าได้เฉพาะเรื่องที่ตัวเองสร้าง หาเรื่องจากเลขใน URL (`/api/admin/(stories|chapters|characters)/:id` ผ่านการ join ถึง `stories.authorId`) ไม่พบแถว ปล่อยให้ handler ตอบ 404 เอง; แอดมินผ่านทุกเรื่อง
- **สร้างแอดมิน:** `seedAdmin()` เมื่อมี `ADMIN_EMAIL`+`ADMIN_PASSWORD` และยังไม่มีบัญชีอีเมลนั้น (ยืนยันอีเมลแล้วตั้งแต่ต้น)
- **รหัสผ่าน:** `Bun.password.hash/verify`

## 4. โมเดลข้อมูล (`schema.ts`, migration ใน `server/drizzle/0000…0021`)

| กลุ่ม | ตาราง | หมายเหตุ |
|---|---|---|
| บัญชี | `users` | `role` (`admin`/`writer`/`user`), `bio`, `prefs` (jsonb การตั้งค่าอ่าน), `suspendedAt`, `passwordChangedAt`, `emailVerifiedAt`, `termsAcceptedAt`, `notificationsSeenAt` |
| | `email_codes` | รหัส 6 หลักที่มีผลอยู่ 1 รหัสต่อ (ผู้ใช้, วัตถุประสงค์: `verify`/`reset`/`change`/`delete`) เก็บเฉพาะ HMAC |
| | `user_ai_keys` | คีย์ OpenRouter เข้ารหัส + 4 ตัวท้าย ไม่เคยถูก select ส่งออกไป |
| | `audit_log` | ใครทำอะไรกับใคร (เปลี่ยนสิทธิ์ ระงับ/เลิกระงับ ลบความคิดเห็นของคนอื่น) |
| เนื้อหา | `stories` | `authorId` (ไม่ cascade), `published`, `status` (`ongoing`/`completed`), `outline` (หนึ่งบรรทัด = หนึ่งตอน `✓ ` = เขียนแล้ว), `coverImage`, `model`, `systemPrompt`, `premise` |
| | `chapters` | unique `(storyId, no)`; `published` + `publishAt` + `releasedAt`; `summary`; `views`/`finishes` (นับรวมแบบไม่ระบุตัวตน); `tokens`/`cost` |
| | `chapter_versions` | ข้อความก่อนถูกเขียนทับทุกครั้ง (เก็บ 10 ล่าสุด) |
| | `characters` | ตัวละครของเรื่อง `visible` = แสดงให้ผู้อ่านเห็นหรือไม่ (AI เห็นทุกตัวเสมอ) |
| ผู้อ่าน | `bookmarks` (ติดตามเรื่อง), `chapter_bookmarks`, `chapter_likes`, `reading_progress` (หนึ่งแถวต่อ ผู้ใช้+เรื่อง), `chapter_reads` | คีย์หลักผสม ไม่มีแถวซ้ำ ลบทั้งหมดเมื่อลบผู้ใช้/เรื่อง (cascade) |
| ชุมชน | `comments` (`parentId` ซ้อนได้ชั้นเดียว), `comment_votes`, `reviews` (unique `(storyId, userId)`, ดาว 1–5), `review_votes`, `review_replies` (แถวเดียว ไม่ซ้อน) | `value` ของโหวต ∈ {-1, 1} |
| | `notifications` | ชนิด `reply`/`vote` unique `(userId, type, commentId)`; `comment_reports` unique `(commentId, reporterId)` |
| เว็บไซต์ | `site_settings`, `info_pages`, `info_page_revisions` | หน้าข้อมูลมีแถวเมื่อแอดมินแก้เท่านั้น ลบแถว = กลับไปข้อความตั้งต้น |
| AI | `ai_usage` | ทุกการเรียกโมเดล: `kind` (generate/rewrite/summary/check/suggest/earlier), `source` (`own`/`site`), tokens, cost |

**เวลา:** timestamp ในฐานข้อมูลเป็น UTC แบบไม่มี timezone ฝั่ง SQL เทียบด้วย `now()` ในฐานข้อมูลเสมอ (เช่น `visible`)

## 5. รายการ API

ย่อ: **ทุกคน** = ไม่ต้องล็อกอิน, **ผู้ใช้** = `userOnly`, **staff** = `staffOnly`, **admin** = `adminOnly`

### 5.1 บัญชี `/api/auth`
| route | สิทธิ์ | ทำอะไร |
|---|---|---|
| `POST /register` | ทุกคน | สมัคร ต้องส่ง `acceptTerms: true`; สร้าง/เขียนทับบัญชีที่ยังไม่ยืนยันอีเมล (กันคนแอบพิมพ์อีเมลคนอื่นล็อกเจ้าของ) แล้วส่งรหัสยืนยัน ยังไม่ให้ session; อีเมลที่ยืนยันแล้วซ้ำ → 409; `ALLOW_REGISTRATION=false` → 403 |
| `POST /login` | ทุกคน | รหัสผิด 401; ถูกระงับ 403; ยังไม่ยืนยันอีเมล 403 พร้อม `needsVerify` และส่งรหัสให้ใหม่; สำเร็จตั้ง cookie |
| `POST /verify` | ทุกคน | กรอกรหัสยืนยันอีเมล → ได้ session ทันที |
| `POST /resend`, `POST /forgot` | ทุกคน | ขอรหัสใหม่ **ตอบ ok เสมอ** ไม่บอกว่ามีบัญชีหรือไม่ |
| `POST /reset` | ทุกคน | รหัส + รหัสผ่านใหม่ → ตั้ง `passwordChangedAt` (อุปกรณ์อื่นหลุด) และถือว่ายืนยันอีเมลแล้ว ไม่ล็อกอินให้ |
| `POST /logout`, `GET /me` | ทุกคน | ลบ cookie / ผู้ใช้ปัจจุบัน (ไม่ได้ล็อกอินหรือ session ใช้ไม่ได้ตอบ 200 พร้อม body ว่างเปล่า ไม่ใช่ JSON `null`) |

### 5.2 อ่าน (สาธารณะ เห็นเฉพาะที่เผยแพร่)
| route | ทำอะไร |
|---|---|
| `GET /stories` | รายการเรื่องที่เผยแพร่ พร้อมจำนวนตอนที่ผู้อ่านเห็น คะแนนเฉลี่ย จำนวนรีวิว เวลาอัปเดต |
| `GET /stories/:id` | ข้อมูลเรื่อง + ตอนที่เห็นได้ + ตัวละครที่ `visible` |
| `GET /stories/:id/chapters/:no` | เนื้อหาตอน (ต้องผ่าน `visible` และเรื่องเผยแพร่) |
| `GET /authors/:id` | โปรไฟล์ผู้แต่ง; ผู้อ่านที่ไม่มีเรื่องเผยแพร่ → 404 |
| `GET /stories/:id/epub` | สร้าง EPUB ตอนเรียก (เฉพาะตอนที่เห็นได้) ไม่มีตอนเลย 404 |
| `GET /stories/:id/feed.xml` | Atom ของ 20 ตอนล่าสุด ลิงก์ใช้ `PUBLIC_URL` |
| `GET /og/story/:id[/read/:no]` | หน้า HTML สั้นที่มี Open Graph สำหรับบอตพรีวิวลิงก์ (ผู้ใช้จริงถูกเด้งไปหน้าจริง) ต้องให้ reverse proxy ชี้บอตมาที่นี่ |
| `POST /stories/:id/chapters/:no/view` | นับยอดเปิด/อ่านจบแบบไม่ระบุตัวตน (`{ done: true }` = อ่านจบ) ไม่เก็บ IP |
| `GET /uploads/:name` | ส่งรูป เฉพาะชื่อที่ตรง `NAME_RE` (กัน path traversal) cache ถาวรเพราะชื่อสุ่มต่อการอัปโหลด |
| `GET /site`, `GET /pages/:slug` | ข้อมูลติดต่อ / เนื้อหาหน้าข้อมูล (แทนที่ `{{operator}}` `{{contactEmail}}` แล้ว) |

### 5.3 ชุมชน
| route | สิทธิ์ | ทำอะไร |
|---|---|---|
| `GET …/chapters/:no/likes` | ทุกคน | จำนวนไลก์ + ตัวเองกดไหม |
| `PUT/DELETE …/chapters/:no/like` | ผู้ใช้ | กด/ถอนไลก์ |
| `GET …/chapters/:no/comments` | ทุกคน | ความคิดเห็นหลักตามหน้า (เรียง `new`/`top`/`replies`) พร้อมคำตอบของแต่ละเธรด (สูงสุด 500) และ `canDelete`/`isAuthor` |
| `POST …/chapters/:no/comments` | ผู้ใช้ | ส่งความคิดเห็น/คำตอบ; ตอบคำตอบจะไปอยู่ใต้ความคิดเห็นหลักเดียวกัน; แจ้งเตือน `reply` ให้เจ้าของที่ถูกตอบ (ถ้าไม่ใช่ตัวเอง) |
| `PATCH /comments/:id` | ผู้ใช้ | แก้ได้เฉพาะของตัวเอง ตั้ง `editedAt` |
| `DELETE /comments/:id` | ผู้ใช้ | ลบได้: เจ้าของ แอดมิน ผู้แต่งเรื่อง; ถ้าลบของคนอื่นเขียน `audit_log` |
| `PUT /comments/:id/vote` | ผู้ใช้ | `value` ∈ {-1,0,1} (0 = ถอน) โหวตของตัวเองไม่ได้; โหวตขึ้นใหม่สร้าง/รีเซ็ตแจ้งเตือน `vote` (ผู้โหวตไม่เปิดเผย ไม่แจ้งโหวตลง) |
| `POST /comments/:id/report` | ผู้ใช้ | รายงาน (ของตัวเองไม่ได้); รายงานซ้ำเปิดเรื่องใหม่พร้อมเหตุผลใหม่ |
| `GET/PUT /stories/:id/reviews` | ทุกคน/ผู้ใช้ | รายการรีวิวพร้อมการกระจายดาว / ส่งหรือแก้รีวิวของตัวเอง (ผู้แต่งรีวิวเรื่องตัวเองไม่ได้) |
| `PUT /reviews/:id/vote`, `POST /reviews/:id/replies` | ผู้ใช้ | โหวต / ตอบกลับรีวิว |
| `DELETE /reviews/:id` | ผู้ใช้ | ลบได้เฉพาะเจ้าของรีวิวและแอดมิน **ผู้แต่งเรื่องลบรีวิวเรื่องตัวเองไม่ได้** (กันซ่อนคำวิจารณ์) |
| `DELETE /review-replies/:id` | ผู้ใช้ | ลบได้: เจ้าของ แอดมิน ผู้แต่งเรื่อง |

### 5.4 บัญชีของฉัน `/api/me` (ผู้ใช้ทุก route)
| route | ทำอะไร |
|---|---|
| `PATCH /profile` | แก้ชื่อ/bio; เปลี่ยนรหัสต้องส่งรหัสปัจจุบัน ตั้ง `passwordChangedAt` แล้วออกโทเคนใหม่ให้เครื่องนี้ |
| `POST /email`, `POST /email/confirm` | เปลี่ยนอีเมล: ต้องใส่รหัสผ่าน รหัสไปที่อีเมลใหม่ เปลี่ยนเมื่อกรอกรหัสถูก |
| `POST /delete`, `POST /delete/confirm` | ลบบัญชี: รหัสผ่านแล้วรหัสอีเมล; แอดมินลบเองไม่ได้ ผู้ที่ยังมีเรื่องอยู่ต้องลบเรื่องก่อน (409); ลบแล้วข้อมูลที่เขียนหายตาม cascade |
| `GET/PUT /prefs` | การตั้งค่าอ่านข้ามอุปกรณ์ (ค่าไม่รู้จักถูกตัดทิ้ง; body ว่าง 422 เพื่อไม่ล้างค่าที่มี) |
| `GET /progress`, `PUT /progress/:id`, `DELETE /progress[/:id]` | ตำแหน่งที่อ่านค้าง (บันทึกได้เฉพาะตอนที่ผู้อ่านเห็น) / ลบประวัติ |
| `GET /bookmarks`, `PUT/DELETE /bookmarks/:id`, `GET /following` | ชั้นหนังสือ (ติดตามเรื่อง) และหน้าเรื่องที่ติดตามพร้อมความคืบหน้า |
| `GET /chapter-bookmarks`, `GET/PUT/DELETE …/:id[/:no]` | บุ๊กมาร์กตอน |
| `GET /reads/:id`, `POST /reads/:id` | ตอนที่อ่านจบ |
| `GET /notifications`, `GET /notifications/count`, `POST /notifications/read` | ดู/นับ/ทำเครื่องหมายว่าอ่านแล้ว (ดูหัวข้อ 6.6) |
| `GET/PUT/DELETE /ai-key` | จัดการคีย์ OpenRouter ของตัวเอง (`PUT` เฉพาะนักเขียน/แอดมิน ตรวจกับ OpenRouter ก่อนเก็บ) |

### 5.5 ผู้ดูแล `/api/admin`
**admin เท่านั้น**
| route | ทำอะไร |
|---|---|
| `GET /users` | ค้นหาชื่อ/อีเมล กรองบทบาท แบ่งหน้า พร้อมจำนวนต่อบทบาท (ไม่ขึ้นกับตัวกรอง) และจำนวนเรื่อง |
| `PATCH /users/:id` | เปลี่ยนบทบาท (ของตัวเองไม่ได้) ลดเป็น `user` จะลบคีย์ AI ที่เก็บไว้ ทุกการเปลี่ยนลง `audit_log` |
| `PATCH /users/:id/suspend` | ระงับ/เลิกระงับ (ตัวเองและแอดมินไม่ได้; สถานะซ้ำ 409) ลง `audit_log` |
| `GET /audit` | 50 รายการล่าสุด |
| `GET /reports`, `POST /reports/:id/dismiss` | รายงานที่ค้าง (รวมเป็นรายการต่อความคิดเห็น) / ปิดรายงานของความคิดเห็นนั้น |
| `GET/PUT /site`, `GET/PUT/DELETE /pages/:slug`, `GET /pages/:slug/revisions[/:id]` | ข้อมูลติดต่อ และหน้าข้อมูล (แก้ → บันทึกประวัติ; ลบ = กลับข้อความตั้งต้น และบันทึกการรีเซ็ตในประวัติด้วย) |

**staff (นักเขียนเห็นเฉพาะเรื่องตัวเอง)**
| route | ทำอะไร |
|---|---|
| `GET/POST /stories`, `GET/PATCH/DELETE /stories/:id` | รายการ/สร้าง/อ่าน/แก้/ลบเรื่อง (ลบแล้วเก็บกวาดรูปที่ไม่มีใครใช้) `GET /stories/:id` ส่งเพิ่ม `nextNo`, `nextBeat`, ยอดใช้จ่าย/ยอดอ่าน, `missingSummaryIds` |
| `POST/DELETE /stories/:id/cover` | อัปโหลด/ลบปก |
| `GET/POST /stories/:id/characters`, `PATCH/DELETE /characters/:id`, `POST/DELETE /characters/:id/image` | ตัวละคร |
| `POST /stories/:id/characters/suggest` | ให้ AI เสนอตัวละครที่พบในเรื่อง (ไม่บันทึก) |
| `GET /stories/:id/chapters` | แถวตอนไม่มีเนื้อหา แบ่งหน้า (ไม่ระบุหน้า = หน้าสุดท้าย) |
| `GET/PATCH/DELETE /chapters/:id` | อ่านเต็ม/แก้/ลบตอน |
| `GET /chapters/:id/versions`, `POST /chapters/:id/restore/:version` | ประวัติและกู้คืน |
| `PATCH /stories/:id/chapters` | เผยแพร่/ซ่อนหลายตอนพร้อมกัน |
| `POST /stories/:id/generate` | AI เขียนตอนใหม่ (สตรีม) |
| `POST /chapters/:id/rewrite` | AI เขียนตอนเดิมใหม่ (สตรีม ไม่บันทึกเอง) |
| `POST /chapters/:id/summarize`, `POST /chapters/:id/check` | สรุปตอน / ตรวจความต่อเนื่อง |
| `POST /images` | อัปโหลดรูปในตัวแก้ไขตอน |

## 6. Flow และกติกาสำคัญ

### 6.1 รหัสยืนยันทางอีเมล (`otp.ts`, `mail.ts`)
`sendCode()` → `issueCode()` สร้างเลข 6 หลัก เก็บเฉพาะ HMAC ที่ผูกกับ (ผู้ใช้, วัตถุประสงค์, อีเมล, รหัส) ใช้ซ้ำข้ามบัญชี/ขั้นตอน/อีเมลไม่ได้ รหัสใหม่แทนที่รหัสเก่า และขอใหม่ได้ไม่เกิน 1 ครั้งต่อนาที (เทียบเวลาใน SQL) → `checkCode()` นับความพยายาม**ก่อน**เทียบ (กันเดาแบบขนาน) ผิดได้ 5 ครั้ง รหัสมีอายุ 10 นาที เทียบแบบ `timingSafeEqual` ใช้ได้ครั้งเดียวแล้วลบ ถ้าส่งอีเมลไม่สำเร็จ: สมัคร/เปลี่ยนอีเมล/ลบบัญชีตอบ 503 แต่ล็อกอินและส่งใหม่กลืน error (หน้าเว็บมีปุ่มส่งใหม่)

### 6.2 ตอนที่ผู้อ่านเห็นได้ (`visibility.ts`, `release.ts`)
ตอนเห็นได้เมื่อ `published` และ (`publishAt` ว่าง หรือ `publishAt <= now()`) **ทุกจุดฝั่งผู้อ่านต้องใช้ `visible`/`visibleSql`** และเรื่องต้อง `published` ด้วย
`releasedAt` คือเวลาที่ตอนขึ้น (หรือจะขึ้น) จริง ใช้วัด "ตอนใหม่" ของแจ้งเตือน ห้ามใช้ `createdAt` `releasedAtFor()` กฎ: ไม่เผยแพร่ → ว่าง; ตั้งเวลา → เวลานั้น (เปลี่ยนเวลาก็ย้ายตาม); เผยแพร่ทันที → เก็บเวลาเดิมถ้าเคยขึ้นแล้ว ไม่งั้น `now` (บันทึกซ้ำจึงไม่ทำให้ตอนกลับมาเป็น "ใหม่") การแก้เฉพาะข้อความไม่แตะ `releasedAt`
การเผยแพร่เป็นชุด (`PATCH /stories/:id/chapters`) ล้าง `publishAt` และใช้กฎเดียวกันใน SQL

### 6.3 แก้/ลบตอน (`versions.ts`, `media.ts`, `markdown.ts`)
- **แก้ตอน** (`PATCH /chapters/:id`): ถ้าชื่อหรือเนื้อหาเปลี่ยน → `snapshot()` เก็บฉบับเดิมก่อน (เก็บ 10 ล่าสุด) → `publishAt: ISO` = ขึ้นตอนนั้น, `null` = ไม่ตั้งเวลา, สั่งเผยแพร่โดยไม่ระบุเวลา = ทันที → รูปที่เนื้อหาใหม่ไม่อ้างอิงแล้วถูกตรวจและลบถ้าไม่มีที่อื่นใช้ (`pruneUnused`)
- **กู้คืน:** `restore()` เก็บฉบับที่กำลังจะถูกแทนที่ไว้ก่อนด้วย จึงย้อนกลับได้อีกครั้ง
- **ลบตอน:** ทำใน transaction: ลบแถว → เลื่อนเลขตอนถัดไปลง 1 (ทำ 2 ขั้น: ติดลบแล้วค่อยลด เพราะ unique `(storyId, no)` ตรวจทีละแถว) → ลบ/เลื่อน `chapter_reads` → ผู้อ่านที่ค้างตอนหลังตอนที่ลบเลื่อนเลขตามและไม่เสียตำแหน่ง ส่วนผู้ที่ค้างในตอนที่ถูกลบเริ่มตอนที่ได้เลขนั้นใหม่ตั้งแต่ต้น (`pos = null`)
- **ไฟล์รูป** (`uploads.ts`): ตรวจชนิดจาก byte แรก (PNG/JPEG/WebP เท่านั้น ไม่รับ SVG; ไม่เชื่อ type ที่ client ส่ง) ≤3 MB ตั้งชื่อ UUID รูปที่อัปโหลดในตัวแก้ไขแต่ไม่ถูกบันทึกลงตอนจะถูก `sweepOrphans` ลบเมื่ออายุเกิน 1 ชั่วโมง

### 6.4 AI: ใครจ่าย ใครใช้อะไรได้ (`ai.ts`, `openrouter.ts`, `secrets.ts`)
- **ไม่มีคีย์กลางของเว็บ** ทุกคน (รวมแอดมิน) ใช้คีย์ OpenRouter ของตัวเองที่เก็บเข้ารหัส AES-256-GCM (IV สุ่มทุกครั้ง, AAD = id ผู้ใช้ จึงคัดลอกไปแถวคนอื่นไม่ได้) `ownKey()` ถอดรหัสเมื่อใช้ ถ้าถอดไม่ได้ (เปลี่ยน secret หรือถูกแก้) ถือว่าไม่มีคีย์
- **`aiGate(me)`** ตัดสินก่อนทุกการเรียก: ไม่มีคีย์และไม่ใช่แอดมิน → หยุด (HTTP 402 พร้อมข้อความ); แอดมินไม่มีคีย์ → ใช้ได้เฉพาะโมเดล `local:`; ผลคือ `AiCtx { access, source: 'own' | 'site', record }` โดย `record()` เขียน `ai_usage` ทุกครั้ง
- **`local:<ชื่อ>`**: ส่งไปเซิร์ฟเวอร์ในเครื่อง (`LOCAL_BASE_URL`) ใช้ได้เฉพาะแอดมิน ไม่ต้องมีคีย์ (timeout 600 วินาที; โมเดลอื่น 180 วินาที); `SUMMARY_MODEL`/`CHECK_MODEL` มีผลเฉพาะผู้เรียกที่ใช้ local ได้
- **ข้อความ error ที่ตรงจุด:** 401 = คีย์ใช้ไม่ได้, 402 = เครดิตหมด, โมเดล reasoning ใช้ token หมดไปกับการคิดจนไม่ตอบ
- **ต้นทุน:** OpenRouter ส่ง `usage.cost` (USD) มาเอง; เก็บที่ `chapters.tokens/cost` (รวมค่าสรุปและตรวจ) และ `ai_usage`

### 6.5 AI เขียนตอน (`index.ts: /generate`, `context.ts`, `chapters.ts`, `guard.ts`, `outline.ts`)
1. `aiGate` → ถ้า `fromOutline` ใช้บรรทัดถัดไปที่ยังไม่มี `✓` ของแผนเรื่องเป็นคำสั่ง (ไม่มีแล้ว → 409)
2. `buildContext()` ประกอบ prompt: system prompt ของเรื่อง (หรือค่าเริ่มต้นใน `prompt.ts`) + แนว/อารมณ์/พล็อต + รายชื่อตัวละคร + **เรื่องย่อของตอนเก่าทุกตอน** + **2 ตอนล่าสุดแบบเต็ม** (`FULL_CHAPTERS`) ต้นทุนจึงไม่โตตามความยาวเรื่อง; ตอนที่ยังไม่มีสรุปใช้ 400 ตัวอักษรแรกแทน; รูปในตอนถูกตัดออกก่อนส่งโมเดล
3. สตรีมผลทีละส่วนกลับเป็น plain text; `loopStart()` ตรวจว่าท้ายข้อความวนซ้ำหรือไม่ (วนระดับ token หรือทั้งประโยค) ถ้าวน → ตัดส่วนที่วนทิ้ง เติมเครื่องหมาย `⚠️` แล้วหยุด
4. **บันทึกใน `finally`:** ทำงานแม้ผู้ใช้ปิดแท็บหรือกดหยุดกลางทาง สิ่งที่เขียนและจ่ายเงินไปแล้วจึงเก็บเป็น**ฉบับร่างที่ยังไม่เผยแพร่** (`addChapter` ลองใหม่ได้ 5 ครั้งถ้าเลขตอนชนกัน); ตอนที่ไม่ครบต่อท้ายชื่อว่า "(ไม่ครบ)"
5. ตอนที่เขียนครบ: ติ๊ก `✓` ที่บรรทัดแผน (อ่าน outline ใหม่อีกรอบเผื่อถูกแก้ระหว่างเขียน) และสั่งสรุปตอนเบื้องหลัง (`summarizeChapter`) โดยไม่รอ
- **เขียนใหม่ (`/rewrite`):** บริบทเห็นเฉพาะตอนก่อนหน้า ผลสตรีมให้ดูตัวอย่างเท่านั้น ไม่บันทึก
- **สรุป (`summarizeChapter`):** ตอนสั้นกว่า 400 ตัวอักษรไม่เรียกโมเดล (ใช้ข้อความเดิม กันได้ข้อความขอโทษมาปนเป็นสรุป) ไม่งั้นส่ง ≤30,000 ตัวอักษร
- **ตรวจความต่อเนื่อง (`checkChapter`):** เทียบกับตัวละครและสรุปตอนก่อนหน้า ตอบเป็นรายการ `- …` หรือ "ไม่พบความขัดแย้ง"
- **เสนอตัวละคร (`suggestCharacters`):** โมเดลตอบ JSON; ใช้ `jsonrepair` แก้ความผิดพลาดเล็กน้อย กรองชื่อที่มีอยู่แล้ว สูงสุด 15

### 6.6 การแจ้งเตือน
สองแหล่ง: (1) แถวใน `notifications` (`reply`, `vote`) (2) **คำนวณสด ไม่เก็บ**: เรื่องที่ติดตามที่มีตอนที่ขึ้นหลังวันที่ติดตาม และผู้อ่านยังไม่ได้อ่านจบ (`newChapterStories`) ตอนที่ตั้งเวลาจึงโผล่ตรงเวลาและหายไปเมื่ออ่านแล้ว `GET /notifications/count` (กระดิ่ง) นับแถวที่ยังไม่อ่าน + เรื่องที่มีตอนออกหลัง `notificationsSeenAt`; `POST /notifications/read` ตั้ง `readAt` ของทุกแถวและอัปเดต `notificationsSeenAt`

### 6.7 ความคืบหน้าการอ่าน
`PUT /me/progress/:id` และ `POST /me/reads/:id` รับเฉพาะตอนที่ผู้อ่านเห็น (`isLive`) เพื่อให้ foreign key ถูกต้อง; `reading_progress` เก็บตอนล่าสุดและตำแหน่ง 0–1; `chapter_reads` เก็บตอนที่อ่านจบ ลบประวัติ (`DELETE /me/progress`) ไม่ลบเครื่องหมายอ่านจบ

### 6.8 หน้าข้อมูลและข้อมูลติดต่อ (`site.ts`, `pageDefaults.ts`, `placeholders.ts`)
เนื้อหา 5 หน้า (terms, privacy, guide, about, contact) ตั้งต้นอยู่ใน `pageDefaults.ts` แอดมินแก้แล้วจะเกิดแถวใน `info_pages` และทุกการบันทึกเพิ่ม `info_page_revisions` ตอนส่งให้ผู้อ่านจะแทน `{{operator}}` และ `{{contactEmail}}` (ใช้ split/join เพื่อไม่ให้ `$` ในชื่อถูกตีความ) ค่าของสองตัวนี้: ที่แอดมินตั้ง → env (`OPERATOR_NAME`/`CONTACT_EMAIL`) → ค่าเริ่มต้น; ถ้าไม่มีอีเมลติดต่อ จะแสดงข้อความ "(ยังไม่ได้ตั้งค่าอีเมลติดต่อ)" ถ้าพฤติกรรมของระบบเปลี่ยน (ข้อมูลที่เก็บ คุกกี้ การใช้ AI) ต้องแก้ข้อความตั้งต้นของ terms และ privacy ด้วย

### 6.9 ไฟล์ส่งออกและแชร์
- **EPUB** (`epub.ts`): เขียน ZIP เอง (deflate, เวลาคงที่ ผลลัพธ์ซ้ำได้) มีหน้าแนะนำเรื่อง หน้าละหนึ่งตอน และสารบัญ แปลง Markdown เป็น XHTML ด้วย `markdown-it` ใส่ปกและรูปในตอน (รูปที่ไฟล์หายหรือไม่ใช่ของเว็บถูกข้าม)
- **Atom** (`feed.ts`), **Open Graph** (`og.ts`): escape ด้วย `xml.ts: esc`

## 7. Rate limit (`ratelimit.ts`)
IP ผู้เรียกมาจาก `clientip.ts` (socket ปกติ หรือ `CF-Connecting-IP` เมื่อ `TRUST_CLOUDFLARE=true`) นับในหน่วยความจำของโพรเซสเดียว (`ponytail:` ถ้ารันหลายอินสแตนซ์ต้องย้ายไปที่เก็บร่วม เช่น Redis) ล้างรายการหมดอายุเมื่อมี >10,000 คีย์

| ขอบเขต | จำกัด |
|---|---|
| สมัคร | 5/ชั่วโมง ต่อ IP |
| ล็อกอิน | 10/15 นาที ต่อ IP+อีเมล (ล็อกอินสำเร็จแล้วล้างตัวนับ) |
| ยืนยันอีเมล / รีเซ็ตรหัส | 10/15 นาที ต่อ IP+อีเมล |
| ส่งรหัสซ้ำ / ลืมรหัส | 10/ชั่วโมง ต่อ IP |
| ดาวน์โหลด EPUB | 20/ชั่วโมง ต่อ IP |
| นับยอดอ่าน | 300/ชั่วโมง ต่อ IP |
| ความคิดเห็น/ตอบ/แก้ (รวมตอบรีวิว) | 10 ต่อ 10 นาที ต่อผู้ใช้ |
| รีวิว | 10 ต่อ 10 นาที ต่อผู้ใช้ |
| โหวต (ความคิดเห็น+รีวิวรวมกัน) | 60 ต่อ 10 นาที ต่อผู้ใช้ |
| ไลก์ | 60 ต่อ 10 นาที ต่อผู้ใช้ |
| รายงานความคิดเห็น | 10/ชั่วโมง ต่อผู้ใช้ |
| เปลี่ยนรหัสผ่าน / เปลี่ยนอีเมล / ลบบัญชี / ตั้งคีย์ AI | 5–10 ต่อ 15 นาที ต่อผู้ใช้ |

## 8. แผนที่ไฟล์ `server/src/`
| ไฟล์ | หน้าที่ |
|---|---|
| `index.ts` | ประกอบ route ทั้งหมด + logic ฝั่งผู้อ่าน/ชุมชน/แอดมิน/AI และตอนบูต |
| `site.ts` | API หน้าข้อมูลและข้อมูลติดต่อ |
| `auth.ts` | JWT, `me`, guards, `ownStory`, `seedAdmin`, `assertConfig` |
| `otp.ts`, `mail.ts` | รหัส 6 หลัก และอีเมลหน้าตาตามธีมเว็บ (รองรับโหมดมืด) |
| `schema.ts`, `db.ts` | ตาราง Drizzle และการเชื่อมต่อ |
| `visibility.ts`, `release.ts` | กติกา "ตอนที่เห็นได้" และ `releasedAt` |
| `chapters.ts`, `versions.ts`, `markdown.ts`, `outline.ts`, `paging.ts` | เพิ่ม/สรุป/ตรวจตอน, ประวัติเวอร์ชัน, จัดรูป Markdown, แผนเรื่อง, แบ่งหน้า |
| `ai.ts`, `openrouter.ts`, `secrets.ts`, `context.ts`, `characters.ts`, `prompt.ts`, `guard.ts` | การเรียกโมเดล ค่าใช้จ่าย การเข้ารหัสคีย์ การประกอบบริบท เสนอตัวละคร ตรวจการวน |
| `uploads.ts`, `media.ts` | เก็บรูป ตรวจชนิดไฟล์ ลบรูปที่ไม่ถูกใช้ |
| `epub.ts`, `feed.ts`, `og.ts`, `xml.ts` | EPUB, Atom, การ์ดแชร์ |
| `ratelimit.ts`, `placeholders.ts`, `pageDefaults.ts` | จำกัดอัตรา, แทนตัวแปรในหน้าข้อมูล, ข้อความตั้งต้น |

## 9. ฐานข้อมูล เทสต์ และข้อมูลตัวอย่าง
- **Migration:** แก้ `schema.ts` แล้ว `cd server && bun run db:generate` เพื่อสร้าง SQL ใน `server/drizzle/` และ `bun run db:migrate` เพื่อใช้ (กติกา: ทุกการเปลี่ยนฐานข้อมูลต้องมี migration ที่รันซ้ำได้)
- **เทสต์:** `cd server && bun test` (ไฟล์ใน `server/test/`: epub, feed, guard, local, mail, markdown, og, openrouter, outline, paging, placeholders, ratelimit, release, secrets, session, uploads)
- **ข้อมูลตัวอย่าง:** `cd server && bun run db:seed-demo` สร้างนักเขียน ผู้อ่าน เรื่อง รีวิว ความคิดเห็นสมมติ (`demo.*@demo.local` รหัส `demo1234`) ไม่เสียเครดิต AI รันซ้ำได้ ไม่ทำงานเมื่อ `NODE_ENV=production`
