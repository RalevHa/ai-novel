// Fills a development database with made-up writers, readers, stories, reviews, comments, replies and votes,
// so the community features can be seen with data. Safe to run twice (it stops if the demo users exist) and
// refuses to run in production. Demo accounts: demo.*@demo.local, password demo1234. Nothing here costs AI credits.
//   cd server && bun run db:seed-demo
import { and, eq, like, sql } from 'drizzle-orm'
import { db } from '../src/db'
import { chapters, characters, commentVotes, comments, reviews, stories, users } from '../src/schema'

if (process.env.NODE_ENV === 'production') throw new Error('seed-demo is for development databases only')
if ((await db.select({ n: sql<number>`count(*)::int` }).from(users).where(like(users.email, '%@demo.local')))[0].n) {
  console.log('demo data is already there (users @demo.local exist), nothing to do'); process.exit(0)
}

// small deterministic random generator: the same data every run
let seed = 20261007
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
const chance = (p: number) => rnd() < p
const DAY = 86_400_000, now = Date.now()
const daysAgo = (d: number) => new Date(now - d * DAY)
const between = (from: Date, to = new Date(now)) => new Date(from.getTime() + rnd() * Math.max(0, to.getTime() - from.getTime()))

const hash = await Bun.password.hash('demo1234')
const mkUsers = async (rows: { email: string; name: string; role: 'writer' | 'user'; bio?: string }[]) =>
  db.insert(users).values(rows.map(r => ({ ...r, email: `${r.email}@demo.local`, passwordHash: hash, createdAt: daysAgo(30 + rnd() * 10) }))).returning({ id: users.id, name: users.name })

const writers = await mkUsers([
  { email: 'demo.writer1', name: 'ใบบัว', role: 'writer', bio: 'เขียนนิยายแฟนตาซีและโรแมนซ์ตอนกลางคืน ชอบกาแฟดำกับฝนตก อัปเดตเรื่องละตอนสองตอนต่อสัปดาห์' },
  { email: 'demo.writer2', name: 'ธารา', role: 'writer', bio: 'อดีตวิศวกรที่หันมาเขียนไซไฟและกำลังภายใน เชื่อว่าตอนจบที่ดีต้องวางไว้ตั้งแต่ตอนแรก' },
])
const readers = await mkUsers(['มะลิ', 'พี่ต้น', 'น้ำฝน', 'โอ๊ต', 'แพรวา', 'ก้อง', 'ฟ้าใส', 'ปลื้ม', 'เจ้านาย', 'ไผ่'].map((name, i) => ({ email: `demo.reader${i + 1}`, name, role: 'user' as const })))
const everyone = [...writers, ...readers]

type Seed = { author: 0 | 1; title: string; genre: string; mood: string; status: 'ongoing' | 'completed'; synopsis: string; chapters: string[]; cast: [string, string, string][] }
const PARAS = [
  'ลมเย็นพัดผ่านหน้าต่างบานเก่า ทำให้เปลวเทียนไหวจนเงาบนผนังดูเหมือนมีชีวิต เขานิ่งฟังเสียงฝีเท้าที่ค่อย ๆ ใกล้เข้ามา',
  'เธอกำจดหมายฉบับนั้นไว้แน่นจนกระดาษยับ ตัวหนังสือที่คุ้นเคยทำให้หัวใจเต้นแรงเกินกว่าจะแสร้งว่าไม่รู้สึกอะไร',
  '"อย่าเพิ่งตัดสินใจตอนนี้" เสียงนั้นดังขึ้นจากด้านหลัง ทุกคนในห้องหันไปมองพร้อมกันราวกับนัดกันไว้',
  'เมื่อรุ่งสาง แสงสีส้มอ่อนสาดลงบนหลังคาเมือง ทุกอย่างดูสงบจนแทบลืมไปว่าเมื่อคืนเกิดอะไรขึ้น',
  'เขาหัวเราะเบา ๆ ทั้งที่ในอกยังหนักอึ้ง บางเรื่องถ้าไม่ขำก็คงต้องร้องไห้ และเขาเลือกอย่างแรกมาตลอด',
  'บนโต๊ะมีแผนที่เก่ากับถ้วยชาที่เย็นไปนานแล้ว ไม่มีใครกล้าเอ่ยปากก่อนว่าพวกเขาไม่เหลือทางเลือกอื่น',
  'เสียงระฆังจากหอสูงดังขึ้นสามครั้ง สัญญาณที่ไม่มีใครอยากได้ยิน เพราะมันหมายความว่าเวลาหมดลงแล้ว',
  'เธอยิ้มให้เขาเป็นครั้งแรกในรอบหลายวัน รอยยิ้มบาง ๆ นั้นทำให้เขารู้ว่าเรื่องทั้งหมดยังไม่จบ',
  'ทางเดินยาวเงียบจนได้ยินเสียงหายใจของตัวเอง ทุกก้าวที่เดินลึกเข้าไป ความรู้สึกว่ามีใครบางคนเฝ้ามองยิ่งชัดขึ้น',
  'ความลับที่เก็บไว้มานานเริ่มรั่วออกมาทีละนิด เหมือนน้ำที่ซึมผ่านรอยร้าวของเขื่อนที่ทุกคนคิดว่าแข็งแรง',
]
const SEEDS: Seed[] = [
  { author: 0, title: 'ดาบแห่งรัตติกาล', genre: 'แฟนตาซี', mood: 'มืดหม่น', status: 'ongoing', synopsis: 'ในโลกที่ดวงอาทิตย์ขึ้นเพียงปีละครั้ง นักดาบหนุ่มผู้ถูกสาปต้องตามหาดาบที่ซ่อนอยู่ในเงามืด ก่อนที่ราตรีอันยาวนานจะกลืนกินทุกคน',
    chapters: ['ราตรีที่ยาวนาน', 'ดาบที่ไร้เงา', 'เมืองใต้เปลวเทียน', 'คำสาปของตระกูล', 'ผู้เฝ้าประตูเงา', 'แสงแรกของปี'], cast: [['ไคร์', 'นักดาบผู้ถูกสาป', 'ชายหนุ่มเงียบขรึม พูดน้อยแต่ไม่เคยทิ้งคำสัญญา มีรอยแผลเป็นรูปจันทร์เสี้ยวที่ฝ่ามือ'], ['เซลีน', 'นักปราชญ์แห่งหอสูง', 'หญิงสาวช่างสังเกต ชอบพูดเป็นปริศนา รู้ความลับของคำสาปมากกว่าที่ยอมบอก']] },
  { author: 0, title: 'ร้านกาแฟปลายทาง', genre: 'โรแมนซ์', mood: 'อบอุ่น', status: 'completed', synopsis: 'ร้านกาแฟเล็ก ๆ ท้ายสายรถไฟฟ้า กับบาริสต้าที่จำออเดอร์ลูกค้าได้ทุกคน ยกเว้นผู้ชายที่มานั่งเงียบ ๆ ทุกคืนวันพฤหัสบดี',
    chapters: ['ลาเต้ไม่ใส่น้ำตาล', 'วันพฤหัสบดีที่ฝนตก', 'เมนูที่ไม่มีในรายการ', 'จดหมายใต้จานรอง', 'ปลายทางของทุกคน'], cast: [['นิล', 'บาริสต้า', 'สาวร่าเริง จำชื่อลูกค้าได้ทุกคน แอบกลัวว่าตัวเองจะเป็นแค่คนที่ผ่านมาในชีวิตใคร'], ['ภูผา', 'ลูกค้าประจำ', 'วิศวกรที่ทำงานดึก พูดน้อย ชอบนั่งโต๊ะริมหน้าต่าง']] },
  { author: 0, title: 'รหัสลับในสายฝน', genre: 'สืบสวน', mood: 'ลึกลับ', status: 'ongoing', synopsis: 'นักข่าวสาวได้รับโน้ตปริศนาที่เปียกฝนทุกครั้งที่มีคดีเกิดขึ้น และเธอเริ่มสงสัยว่าคนส่งรู้เรื่องคดีก่อนตำรวจเสียอีก',
    chapters: ['โน้ตใบแรก', 'เงาใต้ร่ม', 'ห้องที่ล็อกจากข้างใน', 'พยานที่ไม่มีอยู่จริง', 'ลายมือของคนตาย'], cast: [['อรุณี', 'นักข่าวสืบสวน', 'สาวหัวรั้นที่ไม่เชื่อเรื่องบังเอิญ จดทุกอย่างลงสมุดเล่มเล็กสีแดง'], ['ร.ต.อ.วิชัย', 'ตำรวจรุ่นเก๋า', 'ชายวัยห้าสิบที่พูดน้อยและสงสัยทุกคน รวมถึงตัวเอง']] },
  { author: 1, title: 'สถานีอวกาศหมายเลข 9', genre: 'ไซไฟ', mood: 'ตื่นเต้น', status: 'ongoing', synopsis: 'ลูกเรือเก้าคนตื่นขึ้นมาพบว่ายานเงียบสนิท บันทึกการเดินทางหายไปสามปี และมีที่นั่งว่างที่ไม่มีใครจำได้ว่าเคยเป็นของใคร',
    chapters: ['ตื่นจากการหลับ', 'ที่นั่งหมายเลขสิบ', 'สัญญาณจากห้องเครื่อง', 'บันทึกที่ถูกลบ', 'ดาวดวงที่ไม่อยู่ในแผนที่'], cast: [['กัปตันรวี', 'ผู้บัญชาการสถานี', 'หญิงวัยสี่สิบ สุขุมแต่ซ่อนความกลัวเก่งมาก'], ['เอไอ "นภา"', 'ระบบควบคุมสถานี', 'พูดสุภาพเสมอ แต่บางครั้งตอบช้ากว่าที่ควรจะเป็น']] },
  { author: 1, title: 'บันทึกจอมยุทธ์ผู้เกษียณ', genre: 'กำลังภายใน', mood: 'ขำขัน', status: 'completed', synopsis: 'จอมยุทธ์อันดับหนึ่งของยุทธภพประกาศวางมือเพื่อไปเปิดร้านก๋วยเตี๋ยว แต่ศัตรูเก่ากลับมาต่อแถวสั่งชามใหญ่ทุกวัน',
    chapters: ['ชามแรกของชีวิตใหม่', 'ศัตรูที่มาสั่งเส้นเล็ก', 'สูตรน้ำซุปที่ไม่มีใครรู้', 'ประลองยุทธ์หน้าร้าน'], cast: [['เล่าซือหลง', 'อดีตจอมยุทธ์', 'ชายชราอารมณ์ดี ฝีมือสุดยอดแต่ทำบัญชีร้านไม่เป็น'], ['เสี่ยวหลิง', 'ลูกมือประจำร้าน', 'เด็กสาวช่างพูด รู้ทุกเรื่องของยุทธภพจากการแอบฟังลูกค้า']] },
  { author: 1, title: 'โรงเรียนผีสิง', genre: 'สยองขวัญ', mood: 'ลึกลับ', status: 'ongoing', synopsis: 'ทุกคืนวันศุกร์ เสียงออดเข้าเรียนดังขึ้นเองในตึกเก่า และรายชื่อนักเรียนบนกระดานหน้าห้องเพิ่มขึ้นทีละหนึ่งชื่อ',
    chapters: ['เสียงออดตอนเที่ยงคืน', 'ชื่อที่เพิ่มขึ้น', 'ห้องเรียนชั้นสาม', 'สมุดเช็กชื่อ', 'คนสุดท้ายในรายชื่อ'], cast: [['พลอย', 'นักเรียนม.ปลาย', 'เด็กสาวขี้สงสัยที่ไม่เคยเชื่อเรื่องผี จนกระทั่งเห็นชื่อตัวเองบนกระดาน'], ['ครูสมศรี', 'ครูประจำชั้น', 'ครูเงียบ ๆ ที่ทุกคนบอกว่าลาออกไปนานแล้ว']] },
]

const TOP = ['ตอนนี้สนุกมากค่ะ รอตอนต่อไปอยู่นะคะ', 'อ่านจบแล้วขนลุกเลย ฉากท้ายตอนคือดีมาก', 'ชอบที่ผู้แต่งไม่รีบเฉลย ค่อย ๆ วางเงื่อนงำไปเรื่อย ๆ', 'มีตรงไหนที่ผมอ่านข้ามไปหรือเปล่า ทำไมตัวละครถึงรู้เรื่องนั้น?', 'บรรยากาศดีมาก อ่านแล้วเห็นภาพชัดเลย', 'ตอนนี้สั้นไปนิดนึง แต่จบได้น่าติดตาม', 'ทฤษฎีของผม: คนที่ดูเหมือนช่วยพระเอกคือตัวร้ายตัวจริง 555', 'อ่านรอบสองแล้วเพิ่งเห็นว่ามีใบ้ไว้ตั้งแต่ตอนแรก เก่งมาก', 'บทสนทนาธรรมชาติดี ไม่เฟกเลย', 'อยากให้มีตอนพิเศษของตัวละครรองด้วยครับ', 'ฉากเปิดตอนนี้ทำเอาต้องหยุดอ่านไปหยิบน้ำ', 'ไม่ค่อยชอบจังหวะช่วงกลางตอน รู้สึกยืดไปหน่อย แต่ช่วงท้ายชดเชยได้']
const REPLY = ['เห็นด้วยเลย!', 'ผมก็คิดแบบเดียวกันครับ', 'ลองอ่านตอนก่อนหน้าอีกรอบ มีบอกใบ้อยู่นะ', 'ขอบคุณที่อ่านนะคะ ตอนต่อไปจะมาเร็ว ๆ นี้', 'ทฤษฎีนี้น่าสนใจ ขอติดตามต่อ', 'ไม่เห็นด้วยนิดหน่อย ผมว่าเขาแค่ลังเลมากกว่า', '555 ฮามาก', 'จริง ตรงนั้นก็ติดใจเหมือนกัน', 'แอบสปอยล์ไม่ได้นะ แต่ตอนหน้าจะตอบคำถามนี้ค่ะ']
const REVIEW = ['เรื่องนี้ทำให้ผมอ่านเพลินจนลืมเวลา ตัวละครมีมิติและเรื่องเดินหน้าไม่ยืดเยื้อ', 'พล็อตน่าสนใจ ภาษาอ่านลื่น แนะนำสำหรับคนที่ชอบแนวนี้', 'ชอบตัวละครรองมากกว่าตัวเอกอีก 555 หวังว่าจะมีบทบาทมากขึ้น', 'เริ่มต้นช้าไปหน่อยแต่ตั้งแต่ตอนที่สามเป็นต้นไปวางไม่ลงเลย', 'อ่านเอาบรรยากาศอย่างเดียวก็คุ้มแล้ว ฉากและการเล่าเรื่องดีมาก', 'ตอนจบเปิดให้คิดต่อ ชอบมาก', 'ยังมีบางจุดที่รู้สึกว่าเร็วไป แต่โดยรวมถือว่าสนุก', 'ไม่ใช่แนวที่ชอบ แต่ก็อ่านจนจบ ภาษาดีจริง ๆ']

// writers, stories, chapters, characters
const storyIds: { id: number; author: number; chapters: { id: number; at: Date }[] }[] = []
for (const s of SEEDS) {
  const authorId = writers[s.author].id
  const born = daysAgo(24 + rnd() * 4)
  const [story] = await db.insert(stories).values({ authorId, title: s.title, synopsis: s.synopsis, genre: s.genre, mood: s.mood, status: s.status, published: true, createdAt: born }).returning({ id: stories.id })
  const rows = s.chapters.map((title, i) => {
    const at = new Date(born.getTime() + (i + 1) * (1.5 + rnd()) * DAY)
    return { storyId: story.id, no: i + 1, title: `ตอนที่ ${i + 1}: ${title}`, content: `# ตอนที่ ${i + 1}: ${title}\n\n${[pick(PARAS), pick(PARAS), pick(PARAS), pick(PARAS)].join('\n\n')}`, published: true, releasedAt: at, views: Math.floor(40 + rnd() * 400), finishes: Math.floor(20 + rnd() * 200), createdAt: at }
  })
  const inserted = await db.insert(chapters).values(rows).returning({ id: chapters.id, createdAt: chapters.createdAt })
  await db.insert(characters).values(s.cast.map(([name, role, profile]) => ({ storyId: story.id, name, role, profile })))
  storyIds.push({ id: story.id, author: authorId, chapters: inserted.map(c => ({ id: c.id, at: c.createdAt })) })
}

// the existing test story takes part too (its visible chapters only)
const existing = await db.select({ id: stories.id, authorId: stories.authorId }).from(stories).where(and(eq(stories.published, true), sql`not exists (select 1 from ${users} where ${users.id} = ${stories.authorId} and ${users.email} like '%@demo.local')`))
for (const s of existing) {
  const live = await db.select({ id: chapters.id, createdAt: chapters.createdAt }).from(chapters).where(and(eq(chapters.storyId, s.id), eq(chapters.published, true)))
  storyIds.push({ id: s.id, author: s.authorId, chapters: live.map(c => ({ id: c.id, at: c.createdAt })) })
}

// reviews: most readers rate most stories, mostly 4-5 stars
const RATING = [5, 5, 5, 4, 4, 4, 3, 3, 2, 1]
const reviewRows: (typeof reviews.$inferInsert)[] = []
for (const s of storyIds) for (const u of everyone) {
  if (u.id === s.author || !chance(u === readers[0] ? 0.9 : 0.55)) continue
  const createdAt = between(daysAgo(20)), edited = chance(0.25)
  reviewRows.push({ storyId: s.id, userId: u.id, rating: pick(RATING), body: chance(0.7) ? pick(REVIEW) : '', createdAt, updatedAt: edited ? between(createdAt) : createdAt })
}
await db.insert(reviews).values(reviewRows)

// comments, replies, votes
let nComments = 0, nReplies = 0
const allComments: { id: number; userId: number }[] = []
for (const s of storyIds) for (const ch of s.chapters) {
  for (const u of everyone) {
    if (u.id === s.author || !chance(0.28)) continue
    const [top] = await db.insert(comments).values({ storyId: s.id, chapterId: ch.id, userId: u.id, body: pick(TOP), createdAt: between(ch.at) }).returning({ id: comments.id, createdAt: comments.createdAt })
    allComments.push({ id: top.id, userId: u.id }); nComments++
    if (!chance(0.55)) continue
    for (let i = 0, n = 1 + Math.floor(rnd() * 3); i < n; i++) {
      // the story's author answers about a third of the time; otherwise another reader, sometimes naming the person above
      const replier = chance(0.35) ? { id: s.author, name: '' } : pick(everyone.filter(x => x.id !== u.id))
      const mention = i > 0 && chance(0.4) ? `@${pick(everyone).name} ` : ''
      const [r] = await db.insert(comments).values({ storyId: s.id, chapterId: ch.id, userId: replier.id, parentId: top.id, body: mention + pick(REPLY), createdAt: between(top.createdAt) }).returning({ id: comments.id })
      allComments.push({ id: r.id, userId: replier.id }); nReplies++
    }
  }
}
const voteRows: (typeof commentVotes.$inferInsert)[] = []
for (const c of allComments) for (const u of everyone) if (u.id !== c.userId && chance(0.3)) voteRows.push({ commentId: c.id, userId: u.id, value: chance(0.75) ? 1 : -1 })
if (voteRows.length) await db.insert(commentVotes).values(voteRows)

console.log(`seeded: ${everyone.length} users, ${SEEDS.length} stories (+${existing.length} existing), ${reviewRows.length} reviews, ${nComments} comments, ${nReplies} replies, ${voteRows.length} votes`)
await db.$client.end()
